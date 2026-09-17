import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderFadeLab from "./HeaderFadeLab";

export default function ScopesFadeLabPage() {
  return (
    <>
      <PageHeader>
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <a href="/scopes" className="shrink-0 rounded-md px-2 py-1 hover:bg-foreground/10">
            Scopes
          </a>
          <span aria-hidden="true" className="text-muted-foreground">/</span>
          <span className="truncate">Header fade lab</span>
        </div>
      </PageHeader>
      <HeaderFadeLab />
    </>
  );
}
