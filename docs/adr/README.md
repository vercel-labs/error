# Architecture decision records

Name ADRs sequentially as `NNNN-short-slug.md` and never renumber them. Keep each ADR to a title and concise Context, Decision, and Reason sections. Add Status, Considered Options, or Consequences only when they record information the core sections do not.

ADRs record decisions that should outlive one pull request. They are not pull-request summaries or file inventories. When a decision changes, add a new ADR and mark the old one as superseded instead of rewriting it.

Do not include output sizes, bundle sizes, benchmark results, or other measurements that change with tools or builds. Keep that evidence in the implementing pull request. Record only a threshold when the decision depends on one.

For versioned internal protocols, record the versioning rule and compatibility behavior, never the current version identifier. The implementation owns the current value.
