import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProviderRow {
  id: string;
  label: string;
  envKey: string;
  configured: boolean;
}

export function ProviderSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [rows, setRows] = useState<ProviderRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchRows = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/providers");
      const json = (await res.json()) as { providers: ProviderRow[] };
      setRows(json.providers);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void fetchRows();
  }, [open]);

  const configuredCount = rows?.filter((r) => r.configured).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>LLM Providers</DialogTitle>
          <DialogDescription>
            API keys are read from server environment variables. Add the keys you want to use in
            your project secrets. {rows && (
              <span className="font-medium text-foreground">
                {" "}
                {configuredCount}/{rows.length} configured.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={fetchRows} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <div className="grid gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {rows?.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">{r.label}</span>
                <code className="text-[11px] text-muted-foreground">{r.envKey}</code>
              </div>
              {r.configured ? (
                <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                  <CheckCircle2 className="h-3 w-3" />
                  Configured
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <XCircle className="h-3 w-3" />
                  Missing
                </Badge>
              )}
            </div>
          ))}
          {rows && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No providers loaded.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}