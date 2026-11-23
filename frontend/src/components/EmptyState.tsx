export default function EmptyState({ syncing, what = "data" }: { syncing?: boolean; what?: string }) {
  return (
    <div className="card grid place-items-center px-6 py-16 text-center">
      <div className="mb-3 text-3xl">{syncing ? "⏳" : "⌚"}</div>
      <p className="font-medium">{syncing ? "Nog geen data — de eerste sync loopt" : `Nog geen ${what}`}</p>
      <p className="mt-1 max-w-sm text-sm text-muted">
        {syncing
          ? "We halen het afgelopen jaar op bij Garmin. De eerste dagen verschijnen hier vanzelf."
          : "Zodra je horloge dit meet en synchroniseert met Garmin Connect, zie je het hier."}
      </p>
    </div>
  );
}
