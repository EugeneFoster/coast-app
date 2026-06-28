import { requireUser } from "@/lib/auth";

export default async function ChatPage() {
  await requireUser();

  return (
    <div className="p-8">
      <h1 className="font-display text-3xl font-medium text-ink">Chat</h1>
      <p className="mt-2 text-sm text-graph">Team coordination channel.</p>

      <div className="mt-10 flex flex-col items-center justify-center rounded border border-dashed border-rule py-20 text-center">
        <p className="font-display text-lg text-ink">Team chat is on the way</p>
        <p className="mt-2 max-w-sm text-sm text-graph">
          Project-scoped messaging and notifications will appear here in an
          upcoming release.
        </p>
      </div>
    </div>
  );
}
