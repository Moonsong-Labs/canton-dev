# Mapping Daml concepts to diagram elements

This is the heart of the skill: how to translate a Daml workflow described in the canton-course's vocabulary into PlantUML activity diagram elements. Every rule here is grounded in the course (`Philosophy.md §401–597`, lessons on Workflow Analysis and Design). Use the same vocabulary in generated diagrams so a learner reading them recognizes the concepts.

## The five building blocks

The course teaches that any distributed business workflow decomposes into five things:

1. **Events** — moments in time when something happens.
2. **Decisions** — choices someone makes that change what happens next.
3. **Actors** — the people, organizations, or systems making decisions.
4. **Authorization** — who is allowed to make which decision.
5. **Visibility** — who sees which facts, decisions, and consequences.

Each one has a place in the diagram.

## Mapping table

| Daml / course concept | Diagram element |
|---|---|
| Actor (party, system, UI, backend) | Swim lane `\|Name\|` |
| Decision (choice exercise) | Activity `:Exercise <Choice>\non <Template>;` in the controller's lane |
| Authorization (controller, signatory) | Lane that hosts the activity; arrow originates from authorizer's lane |
| Consequence — authorize future decision | Subsequent activity `:Create <Template>;` |
| Consequence — attest new fact | Activity `:Create <FactContract>;` (often with descriptive label) |
| Consequence — retract a fact | Activity `:Archive <Contract>;` |
| Visibility (signatory) | Activity is in the signatory's lane; arrows are direct |
| Visibility (choice observer) | Cross-lane arrow with `-> visible to <party>;` label |
| Visibility (contract observer) | Activity styled with `<<observed>>` stereotype or noted |
| Off-ledger call (HTTP, gRPC, trigger) | Activity in the backend lane; arrow label `-> off-ledger;` |
| UI redirect | Cross-lane arrow with `-> redirect;` label |
| Choice/contract lifetime | Sequence between `Create <Template>` and `Archive <Template>` |
| Conjunctive choice (joint controllers) | ONE activity, controllers listed in label — **not** a fork |
| Pre-condition check (`assertMsg`) | `if (cond?) then ... else :Abort; <<#FFE0E0>>\nkill endif` |
| In-transaction loop (`forA`, `mapA`) | `repeat ... repeat while (more?)` |

## Five rules from the course (paraphrased)

### 1. A choice's lifetime is represented by a contract

*"A choice always remains valid for a specific lifetime, and that lifetime is always represented by a contract."* (Lesson 4)

Practical consequence: every activity that exercises a choice sits between the activity that **creates** the host contract and the activity that **archives** it. When diagramming, do not show a choice exercise before its host contract exists — readers expect the contract creation to come first.

### 2. Mutually exclusive choices live on the same contract

If choices A and B cannot both happen, they share a host. In the diagram, an `if` / `else` from the same predecessor activity into A or B implies they share a contract. The diagram does not have to say so explicitly — the structure carries the meaning.

### 3. Shared state maps to contracts

Where two parties share a fact, there is exactly one contract for it. The same fact does not appear in two lanes simultaneously; if you find yourself drawing the same activity in two lanes, you are probably modelling a single contract that should sit in a coordinator/shared lane.

### 4. Different visibility requires different contracts

If two facts are shared with different sets of parties, they are on different contracts. In the diagram, this often manifests as parallel `Create` activities feeding the same downstream choice — one fact in each visibility scope.

### 5. The canonical analysis order

The course teaches a fixed analysis order:

1. Identify the **decisions** (choices).
2. For each decision, identify its **actors** and the **authorization** they need.
3. List the **consequences** of each decision.
4. Determine the **visibility** of each consequence.

Follow the same order when designing the diagram. Decisions become the activity backbone, actors become the lanes, consequences become the trailing activities, and visibility decides which lane each activity lives in.

## Rules for choosing lanes

The course separates these dimensions; the diagram should too.

- **One lane per distinct actor**. Companies, regulators, market operators, and end users get their own lanes.
- **UI, backend, and on-ledger as separate lanes when relevant**. A request that starts in CompanyA's UI, redirects to CompanyA's backend, and finally hits the ledger is three lanes for CompanyA, not one. The redirects are part of the workflow and the diagram should make them visible.
- **The "coordinator" lane**. In multi-party workflows that involve a market operator, custodian, or central DvP service, that party usually owns parallelism and synchronization. Place its lane between the two parties' lanes (left and right). Sync anchors for fork/join belong here.
- **Order lanes for adjacency, not symmetry**. The diagram is easier to read when each transition is a one-lane hop. Put each actor's backend next to its UI; put the coordinator between the two parties.

## Distinguishing fork from conjunctive choice

This is the single most common modelling mistake when an LLM diagrams Daml. They look superficially similar — multiple parties acting "together" — but they are different:

- **Conjunctive choice (`controller a, b`)** — A single atomic exercise that requires authorization from multiple controllers at the same time. It is *one activity*, sitting in whichever lane reads most naturally (usually the coordinator), with controllers listed in the label.
- **Fork** — Two genuinely independent paths happening in parallel, typically off-ledger. Each branch performs its own work and they synchronize later.

If the two paths cannot proceed independently — they need each other's signatures in the same transaction — it is a conjunctive choice, not a fork.

## Activity label conventions

- Lead with a verb. `:Reserve $10 from CompanyA's contract;` is better than `:Reservation;`.
- Exercise activities: `:Exercise <Choice>\non <Template>;` — both pieces of information are useful.
- Create activities: `:Create <Template>;` or `:Create <Template>\n(authorize <NextChoice>);` to make the consequence explicit.
- Off-ledger backend work: name what is happening, e.g., `:Validate balance via Banking API;`.
- Keep labels under three lines (`\n` for explicit breaks). If a label needs more, the activity is doing too much — split it.

## Start and stop placement

- `start` belongs in the lane of the actor who initiates the workflow. For a choice flow, that is the controller of the first choice. For a workflow, it is the party whose decision kicks things off.
- `stop` belongs in the lane where the workflow's terminal effect lives. For a swap, that is the coordinator (the atomic swap happens there). For a notification flow, it might be the recipient's lane.

When in doubt, draw `start` and `stop` in the coordinator lane — most workflows visually converge there.
