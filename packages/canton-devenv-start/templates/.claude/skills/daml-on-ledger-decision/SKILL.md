---
name: daml-on-ledger-decision
description: Decision framework for choosing between on-ledger Daml/Canton logic and off-ledger backend code. Use whenever the user is designing Daml templates, choices, or interfaces; deciding what should live in a smart contract vs an operator backend; weighing Canton throughput or contention concerns; integrating oracles, KYC, or any external data with Daml; refactoring an on-ledger component because it's too heavy; or asking variations of "should this be a Daml choice?", "where does this logic go?", "is this on-ledger?", or "should the backend handle this?". Default the user toward off-ledger and require explicit justification for putting anything on-ledger.
---

# Daml On-Ledger Decision

## The primordial question

Every Daml/Canton design decision starts with one question:

> **Why does this belong on the ledger?**

Default: off-ledger. The ledger has to *earn* the privilege. Canton has real throughput limits, every on-ledger transaction has signing/validation/consensus overhead, and committed code is hard to change. "Can this run on Daml?" is almost always yes — that's not the question. The question is "what would break if it didn't?"

Treat this question as the framing for every component, choice, field, and integration the user proposes. If a user describes some logic and asks where it goes, walk them through the answer rather than guessing — the goal is for them to internalize the criteria, not to memorize one-off decisions.

## What the ledger uniquely provides

There are exactly five things only a Canton-style distributed ledger can provide. If a function or process consumes none of them, the ledger is the wrong place for it.

| Primitive | What it gives you |
|---|---|
| **Authorization** | Multi-party signed agreement; one party alone cannot fabricate the result. |
| **Non-repudiation** | Cryptographic proof a specific party committed to a specific fact. |
| **Atomicity across parties** | All effects commit or none do, across parties that don't share a database. |
| **Encoded privacy** | Per-fact visibility enforced via Daml's informee semantics, across organizations. |
| **Shared state** | Single source of truth that mutually distrustful parties read from and write to. |

The ledger is not for *computing*. It is for *committing*.

## The five-test criteria

A function or process should be on-ledger if and only if **at least one** of these is true. Walk every test before deciding.

1. **Authority test**: Does this need authorization from parties whose interests conflict? Could one party alone produce the result, or do multiple signatures matter?
2. **Audit test**: Will a party later need to cryptographically prove that this happened (or did not happen) against another party?
3. **Shared-input test**: Does the output of this become input to another party's future on-ledger choice?
4. **Atomicity test**: Must this succeed or fail in the same transaction as other on-ledger effects, across parties?
5. **Privacy-boundary test**: Must the visibility of this fact be enforced via Daml's informee model (not by a backend choosing what to expose)?

If all five are no → **off-ledger**. Put it in the operator's backend, the depositor's client, an oracle service, an analytics pipeline — wherever it naturally fits, but not on the ledger.

If one or more is yes → **on-ledger, but as small as possible**. See the "compute off-ledger, commit on-ledger" pattern below.

Be skeptical of yes answers. The most common mistake is overweighting ledger value out of habit ("it's nice to have everything in one place", "we might want to audit it later", "what if we need to query it"). Push back on each yes until the user can name a specific party, a specific dispute, or a specific transaction that would actually need it.

## Decision workflow

When a user is designing a Daml component and asking where its logic belongs, walk them through this:

1. **State plainly what the function does.** Inputs, outputs, side effects, who calls it, who reads the result. Don't accept vague descriptions like "validate the deposit" — get the specifics.
2. **Run the five tests.** For each, yes/no with one-sentence justification.
3. **If all five are no**, name the specific off-ledger location. (Operator backend? Depositor client? Cron job? Oracle integration? Don't leave this ambiguous.)
4. **If one or more is yes**, decompose:
   - What is the *minimum* on-ledger commitment that satisfies the tests? Usually a small assertion plus a small record.
   - What computation can run off-ledger first and feed the on-ledger commitment as an argument?
   - What on-ledger contract shape carries the off-ledger result onto the ledger? (Examples: `KycApproval`, `PricePoint`, `RiskBudget`, `NavSnapshot`.)
5. **Verify privacy.** Does the on-ledger commitment leak data via informees? If yes, restructure — put the sensitive work behind a sub-choice whose controller list excludes the parties that shouldn't see it.
6. **Estimate frequency.** Per-event high-frequency on-ledger commits are a red flag. Per-batch, per-hour, or per-day commits are usually fine. If a piece of state needs to update at oracle-tick frequency, the *tick stream* is off-ledger; only the *snapshot used by a specific transaction* gets committed.

## The core pattern: compute off-ledger, commit on-ledger

Almost every load-bearing on-ledger artifact in a well-designed Canton system is the *result* of off-ledger work, not the process of it. The Daml choice's body is a thin layer that:

- Takes the off-ledger result as a choice argument or as a CID to a precomputed attestation contract.
- Asserts the result is well-formed, fresh, and within policy.
- Commits the on-ledger consequence (records the receipt, transitions the state machine, transfers custody).

Heavy computation in choice bodies is almost always a smell. If the user is writing arithmetic loops, list aggregations, or anything that would feel ordinary in Python, ask whether that work belongs in the backend instead.

The reason this pattern is so prevalent: the ledger's strengths (authorization, atomicity, audit) are properties of the *commitment*, not the *computation*. The computation can happen anywhere; the commitment can only happen on the ledger. Separating the two lets each part live where it's strongest.

## Worked examples

### Example 1: Oracle pricing for a vault

**Naive design**: a Daml `IPricer.priceShares` method reads the live ETH/USD price from somewhere and returns shares. Off-ledger oracle ticks at 10 Hz get committed on every tick.

**Five tests**:
- Authority: no (the operator alone owns the price feed).
- Audit: yes (the depositor needs to prove the price they got).
- Shared input: yes (the price is the basis for the share calculation that affects the depositor).
- Atomicity: yes (the price used for a deposit must commit alongside the deposit itself).
- Privacy: no (the price is public per vault).

**Decomposition**:
- *Off-ledger*: backend polls the oracle continuously, computes NAV, maintains the live price.
- *On-ledger artifact*: `PricePoint { operator, vaultId, ratio, asOf }` — operator-signed, refreshed periodically (e.g., every minute or on-demand at deposit time), keyed by `(operator, vaultId)`.
- *On-ledger commitment in `AcceptDeposit`*: fetch the latest `PricePoint`, assert `asOf` is within an acceptable window, compute `shares = amount * ratio`, commit `DepositReceipt`.

The oracle tick stream is invisible to the ledger. Only the specific price snapshot tied to a specific deposit is on-ledger.

### Example 2: KYC validation

**Naive design**: `IValidator.validate` calls a KYC service inside the Daml choice body. (This isn't even possible in Daml — there's no HTTP from a choice — but the equivalent mistake is recording every KYC check result as its own Daml transaction.)

**Five tests**:
- Authority: depends — if KYC is a third-party attestor, possibly yes (the attestor must sign). If it's the operator's own backend check, no.
- Audit: yes (regulators need proof the operator checked).
- Shared input: yes (validity gates the depositor's ability to proceed).
- Atomicity: no — the check can be precomputed; the deposit only needs the *result*.
- Privacy: possibly (the result is operator/regulator visible; the underlying KYC data is not).

**Decomposition**:
- *Off-ledger*: KYC service runs in the operator's backend, talks to sanctions APIs, performs the actual check.
- *On-ledger artifact*: `KycApproval { kycProvider, subject, validUntil, scope }` — signed by the KYC provider (and possibly the operator), keyed by subject.
- *On-ledger commitment in `IValidator.validate`*: fetch `KycApproval` by key, assert `validUntil > now` and `scope` matches the requested action. No computation, just verification of the attestation.

The KYC check itself never runs in a choice body. The attestation is the on-ledger artifact.

### Example 3: Operator audit log

**Naive design**: every internal operator event (deposit processed, fee accrued, AUM updated) becomes a Daml contract.

**Five tests**:
- Authority: no (the operator alone records).
- Audit: only specific events matter (regulator-visible records, depositor-visible receipts). Most internal logging is not audited cross-party.
- Shared input: no (nothing outside the operator reads these).
- Atomicity: no (logs don't need to commit atomically with anything else).
- Privacy: no (they're operator-only by default; a database does fine).

**Decomposition**: off-ledger entirely. Use a normal database, log pipeline, or PQS read model. The on-ledger artifacts (`DepositReceipt`, `ShareHolding`) are the *cross-party* evidence; the operator's *internal* log is their own concern.

## The hybrid implementation pattern

Daml interfaces are particularly well-suited to the off-/on-ledger split. The same interface admits two kinds of implementations:

- **Thin impl**: pure arithmetic and assertions on-ledger. Suitable for POCs, simple cases, and anything where the computation is genuinely deterministic and cheap.
- **Fat impl**: verifies that a backend-produced attestation contract is current and within policy, then commits. Suitable for production cases with external data, expensive computation, or high-frequency inputs.

Both expose the same choice signature, the same privacy gate, the same authorization shape. The operator picks which impl is wired into the `Config` based on production requirements. This is exactly what the abstract-method-on-interface pattern enables: callers don't know or care whether they're hitting `FixedRatioPricer` or `OraclePricer`.

When recommending an interface design, name both variants explicitly so the user sees the architecture is open to the hybrid path without v1 having to ship it.

## Anti-patterns quick-check

These are red flags. Surface them immediately when the user proposes them.

- **Oracle ticks on-ledger**: any data stream with per-second or sub-second updates being committed at source frequency. Only commit the snapshot used by a specific transaction.
- **Logging or analytics on-ledger**: if no counterparty disputes these, they belong in a database or log pipeline.
- **Aggregations nobody contests**: live AUM, total volume, count of users — these are dashboard concerns. Snapshot periodically if needed for audit, but don't update on-ledger per event.
- **Retries, scheduling, deduplication on-ledger**: backend driver concerns. The ledger should be commit-or-fail; retry logic lives in the submitter.
- **Daml as a queryable database**: read models live in PQS or the operator's database, not as contracts created just so something can `query` them.
- **Heavy computation inside an interface method**: the abstract method body executes on-ledger. If it's doing real work (loops, lookups, large data), the cost is still on-ledger cost.
- **"Validation" that is actually an external check**: if the validator needs to talk to a KYC service, the check is off-ledger and only the *attestation* is on-ledger. Don't pretend the choice body is doing the check.
- **Premature ledger-ification of operator-internal state**: if it's operator-only and no counterparty disputes it, the operator's database is the right place.

## How to apply this skill in a conversation

When the user is in the middle of a Daml design decision:

1. Identify the specific function or process being discussed. Get them to state it concretely.
2. Quote the primordial question back at them. Make them justify on-ledger placement, not the reverse.
3. Run the five tests with them, one-sentence justifications per test.
4. If the answer is on-ledger, push for the *minimum* on-ledger commitment. The contract shape and the choice body should be as thin as possible.
5. If the answer is off-ledger, name the specific off-ledger location explicitly. Don't leave them vague about where the code goes.
6. Surface any anti-patterns from the quick-check list that apply to their proposal.

The goal is not to discourage on-ledger code. It is to make sure every on-ledger artifact is there because it has to be, and to push everything else where it belongs. A well-designed Canton system has a small, dense, high-value on-ledger surface and a larger off-ledger backend that does the bulk of the work.
