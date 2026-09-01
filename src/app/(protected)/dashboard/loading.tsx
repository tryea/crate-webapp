import { getTranslations } from "next-intl/server";

/*
 * Bespoke loading fallback for the dashboard. It mirrors the real shape of
 * the shift-open screen (verdict line, "Needs you" panel, ledger table,
 * standing facts) so the skeleton-to-content swap shifts nothing.
 *
 * The blocks pulse in BRIGHTNESS, never in `opacity`: opacity on a subtree
 * is grey text by another name, and this page has to hold at zero dimmed
 * text nodes in both themes.
 *
 * a11y: role="status" + sr-only label (WCAG 4.1.3); the blocks are
 * aria-hidden.
 */
export default async function DashboardLoading() {
  const t = await getTranslations("system.loading");

  return (
    <main className="pad" role="status" aria-busy="true">
      <span className="sr-only">{t("label")}</span>

      <div aria-hidden className="flex flex-col gap-2">
        <div className="sk-block h-4 w-44" />
        <div className="sk-block h-6 w-80 max-w-full" />
        <div className="sk-block h-4 w-56 max-w-full" />
      </div>

      <div className="work" aria-hidden>
        <div>
          <section className="panel">
            <div className="panelhead">
              <div className="sk-block h-5 w-24" />
              <div className="sk-block ml-auto h-8 w-44" />
            </div>
            {[0, 1, 2].map((row) => (
              <div key={row} className="qrow">
                <span className="qname">
                  <span className="sk-block h-4 w-48 max-w-full" />
                  <span className="sk-block mt-1 h-3 w-20" />
                </span>
                <span className="sk-block h-4 w-16" />
                <span />
              </div>
            ))}
          </section>

          <section className="ledger">
            <div className="ledgerhead">
              <div className="sk-block h-5 w-28" />
              <div className="sk-block ml-auto h-4 w-28" />
            </div>
            <div className="panel flex flex-col gap-3 p-4">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
                <div key={row} className="sk-block h-4 w-full" />
              ))}
            </div>
          </section>
        </div>

        <aside className="side">
          <div className="sk-block h-4 w-28" />
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="fact">
              <span className="sk-block h-3 w-24" />
              <span className="sk-block mt-1 h-5 w-32" />
            </div>
          ))}
        </aside>
      </div>
    </main>
  );
}
