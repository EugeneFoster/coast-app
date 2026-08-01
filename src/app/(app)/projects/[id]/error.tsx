"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[project-page]", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-8 text-center">
      <h1 className="font-display text-2xl font-medium text-ink">
        Could not load this project
      </h1>
      <p className="mt-2 max-w-md text-sm text-graph">
        Something went wrong while loading the project. You can try again or go
        back to the project list.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-graph">Error {error.digest}</p>
      )}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded border border-rule px-4 py-2 text-sm hover:bg-bone"
        >
          Try again
        </button>
        <Link
          href="/projects"
          className="rounded border border-rule px-4 py-2 text-sm hover:bg-bone"
        >
          Back to projects
        </Link>
      </div>
    </div>
  );
}
