import Link from 'next/link';
import { ArrowLeft, Clock3, MessageCircle } from 'lucide-react';

const solutionNames: Record<string, string> = {
  'social-media': 'Social Media',
  campaigns: 'Campaigns',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  email: 'Email',
  'marketing-finance': 'Marketing Finance',
};

export default async function MarketingSolutionProgressPage({
  params,
}: {
  params: Promise<{ solution: string }>;
}) {
  const { solution } = await params;
  const name = solutionNames[solution] || solution.replaceAll('-', ' ');

  return (
    <div className="grid min-h-[70vh] place-items-center p-4">
      <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm sm:p-10">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-50 text-amber-600">
          <Clock3 className="h-8 w-8" />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.15em] text-emmy-primary">EmmyTech OS · Marketing</p>
        <h1 className="mt-2 text-3xl font-bold capitalize tracking-[-0.04em] text-slate-950">{name}</h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-600">
          We are currently working on this solution. If this is crucial to your department and you want it delivered faster, message us on 07026710999.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href="/modules/marketing"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Marketing
          </Link>
          <a
            href="https://wa.me/2347026710999"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emmy-primary px-5 text-sm font-bold text-white transition hover:bg-emmy-primary-dark"
          >
            <MessageCircle className="h-4 w-4" />
            Message 07026710999
          </a>
        </div>
      </section>
    </div>
  );
}
