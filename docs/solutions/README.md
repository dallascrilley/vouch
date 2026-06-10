# docs/solutions — compound-engineering knowledge base

Captured learnings from solved problems in this repo. Each doc is one problem
or insight, written by the `ce-compound` skill right after a fix is verified,
and read back by `ce-brainstorm`/`ce-plan` before new work is proposed.

- **Search it before debugging:** `grep -ril "<error text or key terms>" docs/solutions/`
- Layout: `docs/solutions/<category>/<problem-slug>.md` with YAML frontmatter
  (`title`, `date`, `category`, `module`, `tags`).
- Maintenance: the `ce-compound-refresh` skill reconciles docs against the
  current codebase (keep / update / consolidate / delete).

The presence of this directory also opts the repo into the
`ce-compound-trigger` Stop hook, which nudges learning capture when commits
land without one.
