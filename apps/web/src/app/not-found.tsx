import Link from 'next/link';
import { site } from '@/site.config';

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm uppercase tracking-widest text-amber-700">404</p>
      <h1 className="text-3xl font-semibold">This page does not exist</h1>
      <p className="max-w-md text-neutral-500">
        The ad you are looking for was never generated. Head back to see what{' '}
        {site.name} does.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm text-white"
      >
        Back to {site.name}
      </Link>
    </main>
  );
}
