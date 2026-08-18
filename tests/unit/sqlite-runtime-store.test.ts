import { describe, expect, it } from "vitest";

import { SQLiteRuntimeStore } from "../../src/adapters/storage/sqlite-runtime-store.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function newStore() {
  const store = new SQLiteRuntimeStore(":memory:");
  store.db.exec("CREATE TABLE tx_probe (id TEXT PRIMARY KEY)");
  return store;
}

function insert(store: SQLiteRuntimeStore, id: string) {
  store.db.prepare("INSERT INTO tx_probe VALUES (?)").run(id);
}

function ids(store: SQLiteRuntimeStore) {
  return (
    store.db.prepare("SELECT id FROM tx_probe ORDER BY id").all() as {
      id: string;
    }[]
  ).map((row) => row.id);
}

describe("SQLiteRuntimeStore transactions", () => {
  it("does not let one request's rollback destroy another's committed write", async () => {
    // Every repository shares the single db handle, so tracking "are we in a
    // transaction" per instance rather than per async context let a second
    // request skip its own BEGIN and silently join the first one. When the
    // first rolled back it took the second request's writes with it, after
    // that request had been told it committed.
    const store = newStore();

    const first = store
      .inTransaction(async () => {
        insert(store, "first");
        // A real macrotask yield, as any fs or network await inside a
        // transaction would produce.
        await sleep(60);
        throw new Error("first request fails");
      })
      .catch(() => "rolled back");

    const second = (async () => {
      await sleep(20);
      await store.inTransaction(() => {
        insert(store, "second");
        return Promise.resolve();
      });
      return "committed";
    })();

    await expect(first).resolves.toBe("rolled back");
    await expect(second).resolves.toBe("committed");
    expect(ids(store)).toEqual(["second"]);

    store.close();
  });

  it("still joins a genuinely nested transaction to the outer one", async () => {
    const store = newStore();

    await expect(
      store.inTransaction(async () => {
        insert(store, "outer");
        await store.inTransaction(() => {
          insert(store, "inner");
          return Promise.resolve();
        });
        throw new Error("outer fails after the nested write");
      })
    ).rejects.toThrow("outer fails after the nested write");

    // The nested call must not have committed independently.
    expect(ids(store)).toEqual([]);

    store.close();
  });
});
