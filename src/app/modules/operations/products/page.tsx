import AdminProductsPage from '@/app/modules/marketing/products/page';
import { HelpTip } from '@/components/ui/help-tip';
import { OPERATIONS_HELP } from '@/lib/operations/help';

export default function OperationsProductsPage() {
  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-slate-600">
        <span className="font-bold text-[#032489]">Website Products</span>
        <HelpTip text={OPERATIONS_HELP.productManager} label="About Products" />
        <span className="text-xs">This is the same Product manager used in Marketing.</span>
      </div>
      <AdminProductsPage />
    </div>
  );
}
