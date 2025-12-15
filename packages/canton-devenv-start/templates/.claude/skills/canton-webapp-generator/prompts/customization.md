# Canton Webapp Customization Guide

After running the webapp generator, customize for your specific Daml model.

---

## ⚠️ CRITICAL: Fully Implement Everything

**No placeholders, no TODOs, no mock data.** Every feature you build must be:

- **Fully functional** - buttons work, forms submit, queries fetch real data
- **Complete** - includes loading states, error handling, and edge cases
- **Connected** - uses actual SDK hooks, not placeholder functions
- **Tested** - verify it works with the running Canton ledger

Do NOT create components that say "Coming soon" or hooks that return fake data. If you're implementing a contract list, it must query real contracts. If you're adding an action button, it must exercise the actual choice.

---

## 1. Discover Templates AND Choices

Read the SDK's `<project-name>-api.ts` to find ALL available templates AND their choices:

```typescript
// In sdk/<project-name>-api.ts, look for:
export const TemplateIds = {
  MyModule_MyTemplate: 'package:Module.Path:TemplateName',
  // ... more templates
};

// Each template has a namespace with Payload, create, and CHOICES:
export namespace MyModule_MyTemplate {
  export interface Payload {
    field1: Party;
    field2: string;
    // ... fields
  }
  export function create(payload: Payload): Command<Payload>;

  // CHOICES - every exported function except 'create' is a choice:
  export function Accept(contractId: ContractId<Payload>): Command<Unit>;
  export function Transfer(contractId: ContractId<Payload>, newOwner: Party): Command<ContractId<Payload>>;
  export function Archive(contractId: ContractId<Payload>): Command<Unit>;
}
```

**CRITICAL**: You MUST discover and implement hooks for ALL choices, not just a subset. Parse each template namespace and identify every exported function that is not `create`.

---

## 2. Create Domain Hooks

In `src/hooks/useContracts.ts`, create hooks for **each template AND each choice discovered**:

```typescript
import { TemplateIds, MyModule_MyTemplate } from '@sdk/<project-name>-api';
import { useContractQuery, useCreateContract, useExerciseChoice } from './useLedger';
import { useAuth } from './useAuth';
import { QUERY_KEYS } from '@/lib/constants';

// Query hook for template
export function useMyContracts(filter?: Partial<MyModule_MyTemplate.Payload>) {
  return useContractQuery<MyModule_MyTemplate.Payload>(
    TemplateIds.MyModule_MyTemplate,
    filter
  );
}

// Create hook
export function useCreateMyContract() {
  const { party } = useAuth();
  return useCreateContract<MyModule_MyTemplate.Payload>(
    TemplateIds.MyModule_MyTemplate,
    {
      invalidateKeys: [
        QUERY_KEYS.contracts(TemplateIds.MyModule_MyTemplate, party || undefined),
      ],
    }
  );
}

// IMPORTANT: Create a hook for EVERY choice discovered in the SDK
// If SDK has Accept, Transfer, Archive choices, create ALL of them:

export function useAcceptMyContract() {
  const { party } = useAuth();
  return useExerciseChoice(
    TemplateIds.MyModule_MyTemplate,
    'Accept',
    {
      invalidateKeys: [
        QUERY_KEYS.contracts(TemplateIds.MyModule_MyTemplate, party || undefined),
      ],
    }
  );
}

export function useTransferMyContract() {
  const { party } = useAuth();
  return useExerciseChoice(
    TemplateIds.MyModule_MyTemplate,
    'Transfer',
    {
      invalidateKeys: [
        QUERY_KEYS.contracts(TemplateIds.MyModule_MyTemplate, party || undefined),
      ],
    }
  );
}

export function useArchiveMyContract() {
  const { party } = useAuth();
  return useExerciseChoice(
    TemplateIds.MyModule_MyTemplate,
    'Archive',
    {
      invalidateKeys: [
        QUERY_KEYS.contracts(TemplateIds.MyModule_MyTemplate, party || undefined),
      ],
    }
  );
}

// Repeat for EVERY choice in the SDK - do not skip any!
```

---

## 3. Build Contract Views

### List Component Pattern

```typescript
// src/features/mycontracts/MyContractList.tsx
import { useMyContracts } from '@/hooks/useContracts';
import { Card, Spinner } from '@/components/ui';
import { ContractCard, EmptyState } from '@/components/shared';

export function MyContractList() {
  const { data: contracts, isLoading, error } = useMyContracts();

  if (isLoading) return <Spinner />;
  if (error) return <p className="text-red-400">Error loading contracts</p>;
  if (!contracts?.length) {
    return <EmptyState title="No contracts" icon="📄" />;
  }

  return (
    <div className="grid gap-4">
      {contracts.map((contract) => (
        <ContractCard
          key={contract.contractId}
          contractId={contract.contractId}
          templateName="MyTemplate"
          payload={contract.payload}
        />
      ))}
    </div>
  );
}
```

### Create Form Pattern

```typescript
// src/features/mycontracts/CreateMyContract.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateMyContract } from '@/hooks/useContracts';
import { useAuth } from '@/hooks/useAuth';
import { Card, Button, Input } from '@/components/ui';

export function CreateMyContract() {
  const navigate = useNavigate();
  const { party } = useAuth();
  const createMutation = useCreateMyContract();
  const [formData, setFormData] = useState({ field1: '', field2: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createMutation.mutateAsync({
      ...formData,
      owner: party!, // Add party fields as needed
    });
    navigate('/my-contracts');
  };

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Field 1"
          value={formData.field1}
          onChange={(e) => setFormData({ ...formData, field1: e.target.value })}
        />
        <Input
          label="Field 2"
          value={formData.field2}
          onChange={(e) => setFormData({ ...formData, field2: e.target.value })}
        />
        <Button type="submit" loading={createMutation.isPending}>
          Create Contract
        </Button>
      </form>
    </Card>
  );
}
```

### Detail with Actions Pattern

**IMPORTANT**: Include buttons for ALL choices discovered in the SDK, not just one or two.

```typescript
// src/features/mycontracts/MyContractDetail.tsx
import { useParams } from 'react-router-dom';
import {
  useMyContracts,
  useAcceptMyContract,
  useTransferMyContract,
  useArchiveMyContract
} from '@/hooks/useContracts';
import { Card, Button } from '@/components/ui';

export function MyContractDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: contracts } = useMyContracts();

  // Import ALL choice hooks for this template
  const acceptMutation = useAcceptMyContract();
  const transferMutation = useTransferMyContract();
  const archiveMutation = useArchiveMyContract();

  const contract = contracts?.find((c) => c.contractId === id);
  if (!contract) return <p>Contract not found</p>;

  return (
    <Card>
      <h2 className="text-xl font-bold mb-4">Contract Details</h2>
      <pre className="text-sm text-slate-300 mb-4">
        {JSON.stringify(contract.payload, null, 2)}
      </pre>

      {/* Include a button for EVERY choice available on this template */}
      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={() => acceptMutation.mutate({ contractId: contract.contractId })}
          loading={acceptMutation.isPending}
        >
          Accept
        </Button>
        <Button
          onClick={() => transferMutation.mutate({ contractId: contract.contractId, args: { newOwner: '...' } })}
          loading={transferMutation.isPending}
        >
          Transfer
        </Button>
        <Button
          variant="destructive"
          onClick={() => archiveMutation.mutate({ contractId: contract.contractId })}
          loading={archiveMutation.isPending}
        >
          Archive
        </Button>
        {/* Add more buttons for any other choices in the SDK */}
      </div>
    </Card>
  );
}
```

---

## 4. Add Role Detection

If your Daml model has role-specific contracts:

```typescript
// In src/hooks/useAuth.tsx, add role detection:

import { useContractQuery } from './useLedger';
import { TemplateIds } from '@sdk/<project-name>-api';

// Inside AuthProvider:
const { data: adminContracts } = useContractQuery(
  TemplateIds.Admin_AdminRole,
  { admin: party },
  { enabled: !!party }
);

const roles = useMemo(() => {
  const r = ['user'];
  if (adminContracts?.length) r.push('admin');
  return r;
}, [adminContracts]);
```

---

## 5. Customize Navigation

Update `src/components/layout/Sidebar.tsx`:

```typescript
const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/my-contracts', label: 'My Contracts', icon: '📄' },
  { to: '/create', label: 'Create', icon: '➕' },
];

// For role-based navigation:
const { roles } = useAuth();
const filteredItems = navItems.filter(item => {
  if (item.adminOnly && !roles.includes('admin')) return false;
  return true;
});
```

---

## 6. Add Routes

Update `src/App.tsx`:

```typescript
import { MyContractList, MyContractDetail, CreateMyContract } from '@/features/mycontracts';

// Inside Routes:
<Route path="/my-contracts" element={<MyContractList />} />
<Route path="/my-contracts/:id" element={<MyContractDetail />} />
<Route path="/create" element={<CreateMyContract />} />
```

---

## Common Patterns

### Filter by Current Party

```typescript
const { party } = useAuth();
const { data } = useMyContracts({ owner: party });
```

### Exercise with Arguments

```typescript
const exerciseMutation = useExerciseChoice<{ amount: string }>(
  TemplateIds.MyTemplate,
  'Transfer'
);

// Usage:
exerciseMutation.mutate({
  contractId: contract.contractId,
  args: { amount: '100.0' },
});
```

### Refresh After Action

Query invalidation is automatic via `invalidateKeys`, but you can also manually refresh:

```typescript
const queryClient = useQueryClient();
queryClient.invalidateQueries({ queryKey: ['contracts'] });
```

