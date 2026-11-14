// [SWAP → EmmyTech OS] Replaces the test-build src/lib/finance/rpc.ts at merge.
// Calls the finance_* functions through Supabase as the signed-in staff member.
import { createClient } from '@/lib/supabase-server';

export class FinanceDataError extends Error {
  readonly notAuthorized: boolean;
  constructor(message: string) {
    super(message);
    this.name = 'FinanceDataError';
    this.notAuthorized = /not authorized/i.test(message);
  }
}

const FUNCTION_NAME = /^finance_[a-z_]+$/;

export async function financeRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!FUNCTION_NAME.test(fn)) throw new FinanceDataError(`Not a finance function: ${fn}`);
  const cleanArgs = Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, cleanArgs);
  if (error) throw new FinanceDataError(error.message);
  return data as T;
}
