#!/usr/bin/env npx ts-node
/**
 * Canton Webapp Generator
 *
 * Generates a React webapp scaffold for Canton ledger integration.
 * Creates project config, UI components, hooks, and base features.
 *
 * Usage: npx ts-node generate-webapp.ts <project-path> <project-name>
 */

import * as fs from 'fs';
import * as path from 'path';

class WebappGenerator {
  private projectPath: string;
  private projectName: string;
  private webappPath: string;

  constructor(projectPath: string, projectName: string) {
    this.projectPath = projectPath;
    this.projectName = projectName;
    this.webappPath = path.join(projectPath, 'webapp');
  }

  generate(): void {
    console.log(`\n📦 Canton Webapp Generator`);
    console.log(`   Project: ${this.projectName}`);
    console.log(`   Output: ${this.webappPath}\n`);

    // Verify SDK exists
    const sdkPath = path.join(this.projectPath, 'sdk');
    if (!fs.existsSync(sdkPath)) {
      console.error(`❌ SDK not found at ${sdkPath}`);
      console.error(`   Please run canton-sdk-generator first.`);
      process.exit(1);
    }

    // Create directories
    this.createDirectories();

    // Generate files
    this.generateProjectConfig();
    this.generateUIComponents();
    this.generateLayoutComponents();
    this.generateSharedComponents();
    this.generateCoreHooks();
    this.generateBaseFeatures();
    this.generateAppShell();
    this.generateLibUtils();

    console.log(`\n✅ Webapp scaffold generated!`);
    console.log(`   Next steps:`);
    console.log(`   1. cd ${this.webappPath} && npm install`);
    console.log(`   2. Start the Canton ledger: daml start`);
    console.log(`   3. npm run dev`);
    console.log(`   4. Open http://localhost:3000`);
    console.log(`\n   Optional: Add typed hooks in src/hooks/useContracts.ts`);
  }

  private createDirectories(): void {
    const dirs = [
      'src/components/ui',
      'src/components/layout',
      'src/components/shared',
      'src/features/auth',
      'src/features/dashboard',
      'src/features/contracts',
      'src/hooks',
      'src/lib',
    ];

    for (const dir of dirs) {
      fs.mkdirSync(path.join(this.webappPath, dir), { recursive: true });
    }
    console.log(`   ✓ Created directory structure`);
  }

  private generateProjectConfig(): void {
    // package.json
    const packageJson = {
      name: `${this.projectName}-webapp`,
      private: true,
      version: '0.1.0',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'tsc && vite build',
        preview: 'vite preview',
      },
      dependencies: {
        react: '^18.2.0',
        'react-dom': '^18.2.0',
        'react-router-dom': '^6.20.0',
        '@tanstack/react-query': '^5.8.0',
      },
      devDependencies: {
        '@types/react': '^18.2.37',
        '@types/react-dom': '^18.2.15',
        '@types/node': '^18.0.0',
        '@vitejs/plugin-react': '^4.2.0',
        autoprefixer: '^10.4.16',
        postcss: '^8.4.31',
        tailwindcss: '^3.3.5',
        typescript: '^5.2.2',
        vite: '^5.0.0',
      },
    };
    this.writeFile('package.json', JSON.stringify(packageJson, null, 2));

    // vite.config.ts
    const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@sdk': path.resolve(__dirname, '../sdk'),
    },
  },
  server: {
    port: 3000,
    // Allow importing the sibling ../sdk folder in dev
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
    proxy: {
      '/v1': {
        target: process.env.VITE_LEDGER_URL || 'http://localhost:7575',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  define: {
    // Fallback for proxy target when env var not set
    'import.meta.env.VITE_LEDGER_URL': JSON.stringify(process.env.VITE_LEDGER_URL || ''),
  },
});
`;
    this.writeFile('vite.config.ts', viteConfig);

    // tsconfig.json
    const tsconfig = {
      compilerOptions: {
        target: 'ES2020',
        useDefineForClassFields: true,
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        skipLibCheck: true,
        moduleResolution: 'bundler',
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: 'react-jsx',
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
        paths: {
          '@/*': ['./src/*'],
          '@sdk/*': ['../sdk/*'],
        },
      },
      include: ['src'],
      references: [{ path: './tsconfig.node.json' }],
    };
    this.writeFile('tsconfig.json', JSON.stringify(tsconfig, null, 2));

    // tsconfig.node.json
    const tsconfigNode = {
      compilerOptions: {
        composite: true,
        skipLibCheck: true,
        module: 'ESNext',
        moduleResolution: 'bundler',
        allowSyntheticDefaultImports: true,
      },
      include: ['vite.config.ts'],
    };
    this.writeFile('tsconfig.node.json', JSON.stringify(tsconfigNode, null, 2));

    // tailwind.config.js
    const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
`;
    this.writeFile('tailwind.config.js', tailwindConfig);

    // postcss.config.js
    const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;
    this.writeFile('postcss.config.js', postcssConfig);

    // index.html
    const indexHtml = `<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${this.projectName}</title>
  </head>
  <body class="bg-slate-900 text-slate-100">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
    this.writeFile('index.html', indexHtml);

    // .gitignore
    const gitignore = `node_modules
dist
.env
.env.local
*.log
`;
    this.writeFile('.gitignore', gitignore);

    // .env.example
    const envExample = `# Canton Webapp Configuration
# Copy this file to .env.local and adjust values

# Ledger URL - leave empty to use Vite proxy (recommended for development)
# Set to full URL for production or direct connection
# VITE_LEDGER_URL=http://localhost:7575

# The Vite proxy forwards /v1/* requests to the ledger.
# This avoids CORS issues during development.
`;
    this.writeFile('.env.example', envExample);

    console.log(`   ✓ Generated project config files`);
  }

  private generateUIComponents(): void {
    // Button
    const button = `import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className = '', children, disabled, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed';
    
    const variants = {
      primary: 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500',
      secondary: 'bg-slate-700 hover:bg-slate-600 text-slate-100 focus:ring-slate-500',
      danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
      ghost: 'bg-transparent hover:bg-slate-800 text-slate-300 focus:ring-slate-500',
    };
    
    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    };

    return (
      <button
        ref={ref}
        className={\`\${baseStyles} \${variants[variant]} \${sizes[size]} \${className}\`}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
`;
    this.writeFile('src/components/ui/Button.tsx', button);

    // Card
    const card = `import { HTMLAttributes, forwardRef } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ padding = 'md', className = '', children, ...props }, ref) => {
    const paddings = {
      none: '',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    };

    return (
      <div
        ref={ref}
        className={\`bg-slate-800 rounded-lg border border-slate-700 \${paddings[padding]} \${className}\`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
`;
    this.writeFile('src/components/ui/Card.tsx', card);

    // Input
    const input = `import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label className="block text-sm font-medium text-slate-300">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={\`w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent \${error ? 'border-red-500' : ''} \${className}\`}
          {...props}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
`;
    this.writeFile('src/components/ui/Input.tsx', input);

    // Select
    const select = `import { SelectHTMLAttributes, forwardRef } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{ value: string; label: string }>;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = '', ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label className="block text-sm font-medium text-slate-300">
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={\`w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent \${error ? 'border-red-500' : ''} \${className}\`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
`;
    this.writeFile('src/components/ui/Select.tsx', select);

    // Badge
    const badge = `interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const variants = {
    default: 'bg-slate-700 text-slate-300',
    success: 'bg-green-900/50 text-green-400 border border-green-800',
    warning: 'bg-yellow-900/50 text-yellow-400 border border-yellow-800',
    danger: 'bg-red-900/50 text-red-400 border border-red-800',
    info: 'bg-blue-900/50 text-blue-400 border border-blue-800',
  };

  return (
    <span className={\`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium \${variants[variant]} \${className}\`}>
      {children}
    </span>
  );
}
`;
    this.writeFile('src/components/ui/Badge.tsx', badge);

    // Spinner
    const spinner = `interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <svg
      className={\`animate-spin text-blue-500 \${sizes[size]} \${className}\`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
`;
    this.writeFile('src/components/ui/Spinner.tsx', spinner);

    // Modal
    const modal = `import { Fragment, ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/60 transition-opacity"
          onClick={onClose}
        />
        
        {/* Modal */}
        <div className="relative bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-slate-700">
          {title && (
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
`;
    this.writeFile('src/components/ui/Modal.tsx', modal);

    // Index
    const uiIndex = `export { Button } from './Button';
export { Card } from './Card';
export { Input } from './Input';
export { Select } from './Select';
export { Badge } from './Badge';
export { Spinner } from './Spinner';
export { Modal } from './Modal';
`;
    this.writeFile('src/components/ui/index.ts', uiIndex);

    console.log(`   ✓ Generated UI components`);
  }

  private generateLayoutComponents(): void {
    // MainLayout
    const mainLayout = `import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function MainLayout() {
  return (
    <div className="min-h-screen bg-slate-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
`;
    this.writeFile('src/components/layout/MainLayout.tsx', mainLayout);

    // Header
    const header = `import { useAuth } from '@/hooks/useAuth';
import { PartyBadge } from '@/components/shared';
import { Button } from '@/components/ui';

export function Header() {
  const { party, setParty } = useAuth();

  return (
    <header className="bg-slate-800 border-b border-slate-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-100">${this.projectName}</h1>
        <div className="flex items-center gap-4">
          {party && <PartyBadge party={party} />}
          <Button variant="ghost" size="sm" onClick={() => setParty(null)}>
            Switch Party
          </Button>
        </div>
      </div>
    </header>
  );
}
`;
    this.writeFile('src/components/layout/Header.tsx', header);

    // Sidebar
    const sidebar = `import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/contracts', label: 'Contracts', icon: '📄' },
  // Add more navigation items as you build features
];

export function Sidebar() {
  return (
    <aside className="w-64 bg-slate-800 border-r border-slate-700 min-h-[calc(100vh-73px)]">
      <nav className="p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              \`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors \${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700'
              }\`
            }
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
`;
    this.writeFile('src/components/layout/Sidebar.tsx', sidebar);

    // Index
    const layoutIndex = `export { MainLayout } from './MainLayout';
export { Header } from './Header';
export { Sidebar } from './Sidebar';
`;
    this.writeFile('src/components/layout/index.ts', layoutIndex);

    console.log(`   ✓ Generated layout components`);
  }

  private generateSharedComponents(): void {
    // PartyBadge
    const partyBadge = `import { Badge } from '@/components/ui';
import { formatPartyId } from '@/lib/utils';

interface PartyBadgeProps {
  party: string;
  showFull?: boolean;
}

export function PartyBadge({ party, showFull = false }: PartyBadgeProps) {
  return (
    <Badge variant="info">
      {showFull ? party : formatPartyId(party)}
    </Badge>
  );
}
`;
    this.writeFile('src/components/shared/PartyBadge.tsx', partyBadge);

    // ContractCard
    const contractCard = `import { Card, Badge, Button } from '@/components/ui';
import { PartyBadge } from './PartyBadge';

interface ContractCardProps {
  contractId: string;
  templateName: string;
  payload: Record<string, unknown>;
  onView?: () => void;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary' | 'danger';
    loading?: boolean;
  }>;
}

export function ContractCard({
  contractId,
  templateName,
  payload,
  onView,
  actions = [],
}: ContractCardProps) {
  return (
    <Card className="hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <Badge variant="default">{templateName}</Badge>
          <p className="text-xs text-slate-500 mt-1 font-mono">
            {contractId.slice(0, 16)}...
          </p>
        </div>
        {onView && (
          <Button variant="ghost" size="sm" onClick={onView}>
            View
          </Button>
        )}
      </div>
      
      <div className="space-y-2 text-sm">
        {Object.entries(payload).slice(0, 3).map(([key, value]) => (
          <div key={key} className="flex justify-between">
            <span className="text-slate-400">{key}:</span>
            <span className="text-slate-200 truncate max-w-[200px]">
              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </span>
          </div>
        ))}
      </div>

      {actions.length > 0 && (
        <div className="flex gap-2 mt-4 pt-4 border-t border-slate-700">
          {actions.map((action, i) => (
            <Button
              key={i}
              variant={action.variant || 'secondary'}
              size="sm"
              onClick={action.onClick}
              loading={action.loading}
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}
`;
    this.writeFile('src/components/shared/ContractCard.tsx', contractCard);

    // EmptyState
    const emptyState = `interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="text-4xl mb-4">{icon}</span>
      <h3 className="text-lg font-medium text-slate-200 mb-1">{title}</h3>
      {description && (
        <p className="text-slate-400 mb-4 max-w-sm">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="text-blue-500 hover:text-blue-400 font-medium"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
`;
    this.writeFile('src/components/shared/EmptyState.tsx', emptyState);

    // Index
    const sharedIndex = `export { PartyBadge } from './PartyBadge';
export { ContractCard } from './ContractCard';
export { EmptyState } from './EmptyState';
`;
    this.writeFile('src/components/shared/index.ts', sharedIndex);

    console.log(`   ✓ Generated shared components`);
  }

  private generateCoreHooks(): void {
    // useAuth
    const useAuth = `import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

type Party = string;

interface AuthContextType {
  party: Party | null;
  setParty: (party: Party | null) => void;
  roles: string[];
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [party, setParty] = useState<Party | null>(null);
  const [roles] = useState<string[]>(['user']);

  const value = useMemo(
    () => ({
      party,
      setParty,
      roles,
      isAuthenticated: !!party,
    }),
    [party, roles]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
`;
    this.writeFile('src/hooks/useAuth.tsx', useAuth);

    // useLedger
    const useLedger = `import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { CantonLedgerClient } from '@sdk/ledger';
import type { ContractId, Contract } from '@sdk/core/primitives';
import { getLedgerUrl, QUERY_KEYS } from '@/lib/constants';

/**
 * Hook to get a ledger client for the current party.
 * Returns null if no party is selected.
 */
export function useLedgerClient() {
  const { party } = useAuth();
  return useMemo(() => {
    if (!party) return null;
    const ledgerUrl = getLedgerUrl();
    return new CantonLedgerClient(party, ledgerUrl);
  }, [party]);
}

/**
 * Generic contract query hook.
 * @param templateId - The template ID to query
 * @param filter - Optional filter for the query
 * @param options - Query options
 */
export function useContractQuery<T>(
  templateId: string,
  filter?: Partial<T>,
  options?: { enabled?: boolean }
) {
  const client = useLedgerClient();
  const { party } = useAuth();

  return useQuery({
    queryKey: QUERY_KEYS.contracts(templateId, party || undefined),
    queryFn: () => client!.query<T>(templateId, filter),
    enabled: !!client && (options?.enabled !== false),
  });
}

/**
 * Generic create contract hook.
 * @param templateId - The template ID to create
 * @param options - Mutation options including cache invalidation keys
 */
export function useCreateContract<T>(
  templateId: string,
  options?: { invalidateKeys?: readonly QueryKey[] }
) {
  const client = useLedgerClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: T) => client!.create<T>(templateId, payload),
    onSuccess: () => {
      options?.invalidateKeys?.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: [...key] });
      });
    },
  });
}

/**
 * Generic exercise choice hook.
 * @param templateId - The template ID
 * @param choice - The choice name to exercise
 * @param options - Mutation options including cache invalidation keys
 */
export function useExerciseChoice<TArgs = Record<string, never>, TResult = unknown>(
  templateId: string,
  choice: string,
  options?: { invalidateKeys?: readonly QueryKey[] }
) {
  const client = useLedgerClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { contractId: string; args?: TArgs }) => {
      return client!.exercise<unknown, TResult>(
        templateId,
        input.contractId as ContractId<unknown>,
        choice,
        input.args ?? {}
      );
    },
    onSuccess: () => {
      options?.invalidateKeys?.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: [...key] });
      });
    },
  });
}

// Re-export Contract type for convenience
export type { Contract };
`;
    this.writeFile('src/hooks/useLedger.ts', useLedger);

    // useContracts - domain hooks file with working example pattern
    const useContracts = `/**
 * Domain-specific contract hooks
 * 
 * This file provides typed hooks for querying and mutating contracts.
 * Customize these hooks based on your Daml model's templates.
 * 
 * Pattern:
 * 1. Import TemplateIds and type namespaces from the SDK
 * 2. Create query hooks with useContractQuery<TemplateNamespace.Payload>
 * 3. Create mutation hooks with useCreateContract/useExerciseChoice
 * 4. Export all hooks for use in components
 */

import { TemplateIds } from '@sdk/${this.projectName}-api';
import type * as API from '@sdk/${this.projectName}-api';
import { useContractQuery, useCreateContract, useExerciseChoice, type Contract } from './useLedger';
import { useAuth } from './useAuth';
import { QUERY_KEYS } from '@/lib/constants';

// ═══════════════════════════════════════════════════════════════
// GENERIC ALL-CONTRACTS HOOK
// ═══════════════════════════════════════════════════════════════

/**
 * Get all template IDs available in the SDK.
 * Use this for dynamic template discovery.
 */
export function getAvailableTemplates(): string[] {
  return Object.keys(TemplateIds);
}

/**
 * Generic hook to query any template by its ID.
 * Use for dynamic/generic contract views.
 */
export function useAnyContracts<T = unknown>(
  templateId: string,
  filter?: Partial<T>,
  options?: { enabled?: boolean }
) {
  return useContractQuery<T>(templateId, filter, options);
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATE-SPECIFIC HOOKS
// ═══════════════════════════════════════════════════════════════
// Add typed hooks for your specific templates below.
// Example pattern for each template:
//
// export function useMyTemplates(filter?: Partial<API.MyModule_MyTemplate.Payload>) {
//   return useContractQuery<API.MyModule_MyTemplate.Payload>(
//     TemplateIds.MyModule_MyTemplate,
//     filter
//   );
// }
//
// export function useCreateMyTemplate() {
//   const { party } = useAuth();
//   return useCreateContract<API.MyModule_MyTemplate.Payload>(
//     TemplateIds.MyModule_MyTemplate,
//     { invalidateKeys: [QUERY_KEYS.allContracts(TemplateIds.MyModule_MyTemplate)] }
//   );
// }
//
// export function useAcceptMyTemplate() {
//   return useExerciseChoice(
//     TemplateIds.MyModule_MyTemplate,
//     'Accept',
//     { invalidateKeys: [QUERY_KEYS.allContracts(TemplateIds.MyModule_MyTemplate)] }
//   );
// }

// Re-export types for convenience
export { TemplateIds };
export type { Contract };
`;
    this.writeFile('src/hooks/useContracts.ts', useContracts);

    // Index
    const hooksIndex = `// Auth hooks
export { AuthProvider, useAuth } from './useAuth';

// Ledger hooks
export {
  useLedgerClient,
  useContractQuery,
  useCreateContract,
  useExerciseChoice,
  type Contract,
} from './useLedger';

// Domain hooks (add your typed hooks here)
export {
  useAnyContracts,
  getAvailableTemplates,
  TemplateIds,
} from './useContracts';
`;
    this.writeFile('src/hooks/index.ts', hooksIndex);

    console.log(`   ✓ Generated core hooks`);
  }

  private generateBaseFeatures(): void {
    // PartySelector
    const partySelector = `import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, Button, Input } from '@/components/ui';

export function PartySelector() {
  const navigate = useNavigate();
  const { setParty } = useAuth();
  const [party, setPartyValue] = useState('');

  const onContinue = () => {
    const trimmed = party.trim();
    if (!trimmed) return;
    setParty(trimmed);
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <h2 className="text-xl font-bold text-slate-100 mb-4 text-center">
          Enter Party
        </h2>
        <p className="text-slate-400 text-sm mb-4 text-center">
          Paste a party identifier from your ledger output (for example from \`daml start\`).
        </p>

        <div className="space-y-4">
          <Input
            label="Party ID"
            placeholder="Alice::1220..."
            value={party}
            onChange={(e) => setPartyValue(e.target.value)}
          />
          <Button className="w-full" onClick={onContinue} disabled={!party.trim()}>
            Continue
          </Button>
        </div>
      </Card>
    </div>
  );
}
`;
    this.writeFile('src/features/auth/PartySelector.tsx', partySelector);
    this.writeFile('src/features/auth/index.ts', `export { PartySelector } from './PartySelector';\n`);

    // Dashboard
    const dashboard = `import { useAuth } from '@/hooks/useAuth';
import { Card, Badge } from '@/components/ui';
import { PartyBadge } from '@/components/shared';
import { getLedgerUrl } from '@/lib/constants';
import { getAvailableTemplates } from '@/hooks/useContracts';

export function Dashboard() {
  const { party } = useAuth();
  const ledgerUrl = getLedgerUrl() || 'proxy → localhost:7575';
  const templates = getAvailableTemplates();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Dashboard</h2>
        <p className="text-slate-400">Welcome to ${this.projectName}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <h3 className="text-sm font-medium text-slate-400 mb-2">Current Party</h3>
          {party && <PartyBadge party={party} />}
        </Card>
        
        <Card>
          <h3 className="text-sm font-medium text-slate-400 mb-2">Status</h3>
          <p className="text-green-400 font-medium">Connected</p>
        </Card>
        
        <Card>
          <h3 className="text-sm font-medium text-slate-400 mb-2">Ledger</h3>
          <p className="text-slate-200 text-sm truncate" title={ledgerUrl}>
            {ledgerUrl}
          </p>
        </Card>
      </div>

      <Card>
        <h3 className="text-lg font-medium text-slate-100 mb-4">Available Templates</h3>
        <div className="flex flex-wrap gap-2">
          {templates.length > 0 ? (
            templates.slice(0, 10).map((t) => (
              <Badge key={t} variant="info">
                {t.split('_').pop()}
              </Badge>
            ))
          ) : (
            <p className="text-slate-400 text-sm">No templates found in SDK</p>
          )}
          {templates.length > 10 && (
            <Badge variant="default">+{templates.length - 10} more</Badge>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-medium text-slate-100 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <a
            href="/contracts"
            className="p-4 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors text-center"
          >
            <span className="text-2xl mb-2 block">📄</span>
            <span className="text-sm text-slate-300">Browse Contracts</span>
          </a>
          <a
            href="http://localhost:7575"
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 bg-slate-700/50 rounded-lg hover:bg-slate-700 transition-colors text-center"
          >
            <span className="text-2xl mb-2 block">🔗</span>
            <span className="text-sm text-slate-300">JSON API</span>
          </a>
        </div>
      </Card>
    </div>
  );
}
`;
    this.writeFile('src/features/dashboard/Dashboard.tsx', dashboard);
    this.writeFile('src/features/dashboard/index.ts', `export { Dashboard } from './Dashboard';\n`);

    // Contracts - working contract list with template selector
    const contractList = `/**
 * Contract List View
 * 
 * A generic contract browser that works with any template.
 * Select a template from the dropdown to view contracts of that type.
 */

import { useState, useMemo } from 'react';
import { Card, Spinner, Select } from '@/components/ui';
import { EmptyState, ContractCard } from '@/components/shared';
import { useAnyContracts, getAvailableTemplates, TemplateIds } from '@/hooks/useContracts';

export function ContractList() {
  // Get all available templates from the SDK
  const templates = useMemo(() => getAvailableTemplates(), []);
  const [selectedTemplate, setSelectedTemplate] = useState<string>(templates[0] || '');

  // Get the actual template ID string
  const templateId = selectedTemplate ? (TemplateIds as Record<string, string>)[selectedTemplate] : '';

  // Query contracts for the selected template
  const { data: contracts, isLoading, error } = useAnyContracts(
    templateId,
    undefined,
    { enabled: !!templateId }
  );

  // Build select options
  const templateOptions = useMemo(() => 
    templates.map(t => ({
      value: t,
      label: t.replace(/_/g, ' / '),
    })),
    [templates]
  );

  if (templates.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-100">Contracts</h2>
        <EmptyState
          icon="📭"
          title="No templates found"
          description="The SDK doesn't have any templates. Make sure the SDK was generated correctly."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-100">Contracts</h2>
        <div className="w-64">
          <Select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            options={templateOptions}
          />
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <Card className="bg-red-900/20 border-red-800">
          <p className="text-red-400">Failed to load contracts: {String(error)}</p>
        </Card>
      )}

      {!isLoading && !error && contracts?.length === 0 && (
        <EmptyState
          icon="📄"
          title="No contracts found"
          description={\`No \${selectedTemplate.replace(/_/g, ' ')} contracts exist on the ledger.\`}
        />
      )}

      {!isLoading && !error && contracts && contracts.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {contracts.map((contract) => (
            <ContractCard
              key={contract.contractId}
              contractId={contract.contractId}
              templateName={selectedTemplate.split('_').pop() || selectedTemplate}
              payload={contract.payload as Record<string, unknown>}
            />
          ))}
        </div>
      )}

      <Card className="bg-slate-800/50">
        <p className="text-slate-400 text-sm">
          <strong className="text-slate-300">Tip:</strong> Create typed hooks in{' '}
          <code className="text-blue-400">src/hooks/useContracts.ts</code> for better
          type safety and custom filtering.
        </p>
      </Card>
    </div>
  );
}
`;
    this.writeFile('src/features/contracts/ContractList.tsx', contractList);
    this.writeFile('src/features/contracts/index.ts', `export { ContractList } from './ContractList';\n`);

    console.log(`   ✓ Generated base features`);
  }

  private generateAppShell(): void {
    // main.tsx
    const main = `import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 2,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
`;
    this.writeFile('src/main.tsx', main);

    // App.tsx
    const app = `import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { MainLayout } from '@/components/layout';
import { PartySelector } from '@/features/auth';
import { Dashboard } from '@/features/dashboard';
import { ContractList } from '@/features/contracts';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" />;
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PartySelector />} />
        <Route
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/contracts" element={<ContractList />} />
          {/* Add more routes as you build features */}
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
`;
    this.writeFile('src/App.tsx', app);

    // index.css
    const indexCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
`;
    this.writeFile('src/index.css', indexCss);

    // vite-env.d.ts
    const viteEnv = `/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LEDGER_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
`;
    this.writeFile('src/vite-env.d.ts', viteEnv);

    console.log(`   ✓ Generated app shell`);
  }

  private generateLibUtils(): void {
    // constants.ts
    const constants = `/**
 * Get the ledger URL for API calls.
 * In development with Vite proxy, use empty string (relative /v1 paths).
 * In production or with explicit env var, use the full URL.
 */
export function getLedgerUrl(): string {
  // If VITE_LEDGER_URL is set, use it (for production builds or direct connections)
  const envUrl = import.meta.env.VITE_LEDGER_URL;
  if (envUrl) {
    return envUrl;
  }
  // In development, use empty string to leverage Vite's proxy
  // The proxy forwards /v1/* to http://localhost:7575/v1/*
  return '';
}

/** @deprecated Use getLedgerUrl() instead */
export const LEDGER_URL = '';

/**
 * Query key factories for TanStack Query cache management.
 * Use these to invalidate specific queries after mutations.
 */
export const QUERY_KEYS = {
  /** Key for parties query */
  parties: ['parties'] as const,
  
  /** Key factory for contract queries by template and party */
  contracts: (templateId: string, party?: string) =>
    ['contracts', templateId, party] as const,
    
  /** Key factory for all contracts of a template */
  allContracts: (templateId: string) =>
    ['contracts', templateId] as const,
} as const;
`;
    this.writeFile('src/lib/constants.ts', constants);

    // utils.ts
    const utils = `/**
 * Format a party ID for display
 * "Alice::1220abc..." → "Alice"
 */
export function formatPartyId(party: string): string {
  return party.split('::')[0];
}

/**
 * Format a numeric amount for display
 */
export function formatAmount(amount: string | number, decimals = 2): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Truncate a string (useful for contract IDs)
 */
export function truncate(str: string, length = 16): string {
  if (str.length <= length) return str;
  return \`\${str.slice(0, length)}...\`;
}

/**
 * Format a timestamp for display
 */
export function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}
`;
    this.writeFile('src/lib/utils.ts', utils);

    console.log(`   ✓ Generated lib utilities`);
  }

  private writeFile(relativePath: string, content: string): void {
    const fullPath = path.join(this.webappPath, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
}

// Main
function main(): void {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: npx ts-node generate-webapp.ts <project-path> <project-name>');
    console.error('Example: npx ts-node generate-webapp.ts /path/to/project vault');
    process.exit(1);
  }

  const projectPath = path.resolve(args[0]);
  const projectName = args[1];

  if (!fs.existsSync(projectPath)) {
    console.error(`Error: Project path not found: ${projectPath}`);
    process.exit(1);
  }

  const generator = new WebappGenerator(projectPath, projectName);
  generator.generate();
}

if (require.main === module) {
  main();
}

