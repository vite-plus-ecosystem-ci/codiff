import type { ShareStats, ShareStatsDay } from '@nkzw/codiff-service/views';
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { type ViewRef, useRequest, useView, view } from 'react-fate';
import { usePageTitle } from './utils.ts';

const ShareStatsDayView = view<ShareStatsDay>()({
  date: true,
  id: true,
  plans: true,
  walkthroughs: true,
});

const ShareStatsView = view<ShareStats>()({
  days: ShareStatsDayView,
  id: true,
  maxDailyShares: true,
  totalPlans: true,
  totalWalkthroughs: true,
});

const chartWidth = 760;
const chartHeight = 280;
const chartLeft = 46;
const chartRight = 18;
const chartTop = 20;
const chartBottom = 42;
const plotWidth = chartWidth - chartLeft - chartRight;
const plotHeight = chartHeight - chartTop - chartBottom;

const chartX = (index: number, length: number) =>
  chartLeft + (index / Math.max(1, length - 1)) * plotWidth;

const chartY = (value: number, maximum: number) =>
  chartTop + (1 - value / Math.max(1, maximum)) * plotHeight;

const formatDate = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

const StatsChartDay = ({
  day: dayRef,
  index,
  length,
  maximum,
  previous: previousRef,
}: {
  day: ViewRef<'ShareStatsDay'>;
  index: number;
  length: number;
  maximum: number;
  previous: ViewRef<'ShareStatsDay'> | null;
}) => {
  const day = useView(ShareStatsDayView, dayRef);
  const previous = useView(ShareStatsDayView, previousRef);
  const x = chartX(index, length);
  const plansY = chartY(day.plans, maximum);
  const walkthroughsY = chartY(day.walkthroughs, maximum);
  const previousX = chartX(index - 1, length);

  return (
    <g>
      {previous ? (
        <>
          <line
            className="codiff-web-stats-line codiff-web-stats-line-plans"
            x1={previousX}
            x2={x}
            y1={chartY(previous.plans, maximum)}
            y2={plansY}
          />
          <line
            className="codiff-web-stats-line codiff-web-stats-line-walkthroughs"
            x1={previousX}
            x2={x}
            y1={chartY(previous.walkthroughs, maximum)}
            y2={walkthroughsY}
          />
        </>
      ) : null}
      <circle
        className="codiff-web-stats-point codiff-web-stats-point-plans"
        cx={x}
        cy={plansY}
        r="4"
      >
        <title>{`${formatDate(day.date)}: ${day.plans} plans`}</title>
      </circle>
      <circle
        className="codiff-web-stats-point codiff-web-stats-point-walkthroughs"
        cx={x}
        cy={walkthroughsY}
        r="4"
      >
        <title>{`${formatDate(day.date)}: ${day.walkthroughs} walkthrough shares`}</title>
      </circle>
      <text className="codiff-web-stats-axis-label" textAnchor="middle" x={x} y={chartHeight - 12}>
        {formatDate(day.date)}
      </text>
    </g>
  );
};

const StatsChart = ({
  days,
  maximum,
}: {
  days: ReadonlyArray<ViewRef<'ShareStatsDay'>>;
  maximum: number;
}) => (
  <section className="codiff-web-stats-chart-card">
    <header>
      <h2>Activity over the last 7 days</h2>
      <div aria-label="Chart legend" className="codiff-web-stats-legend">
        <span data-series="plans">Plans</span>
        <span data-series="walkthroughs">Walkthrough Shares</span>
      </div>
    </header>
    <div className="codiff-web-stats-chart-scroll">
      <svg
        aria-label="Daily plans and walkthrough shares over the last seven days"
        className="codiff-web-stats-chart"
        role="img"
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      >
        <line
          className="codiff-web-stats-grid-line"
          x1={chartLeft}
          x2={chartWidth - chartRight}
          y1={chartTop}
          y2={chartTop}
        />
        <line
          className="codiff-web-stats-grid-line"
          x1={chartLeft}
          x2={chartWidth - chartRight}
          y1={chartTop + plotHeight / 2}
          y2={chartTop + plotHeight / 2}
        />
        <line
          className="codiff-web-stats-grid-line"
          x1={chartLeft}
          x2={chartWidth - chartRight}
          y1={chartTop + plotHeight}
          y2={chartTop + plotHeight}
        />
        <text
          className="codiff-web-stats-axis-label"
          textAnchor="end"
          x={chartLeft - 10}
          y={chartTop + 4}
        >
          {maximum}
        </text>
        <text
          className="codiff-web-stats-axis-label"
          textAnchor="end"
          x={chartLeft - 10}
          y={chartTop + plotHeight + 4}
        >
          0
        </text>
        {days.map((day, index) => (
          <StatsChartDay
            day={day}
            index={index}
            key={day.id}
            length={days.length}
            maximum={maximum}
            previous={days[index - 1] ?? null}
          />
        ))}
      </svg>
    </div>
  </section>
);

const StatsContent = ({ stats: statsRef }: { stats: ViewRef<'ShareStats'> }) => {
  const stats = useView(ShareStatsView, statsRef);
  const number = new Intl.NumberFormat();

  return (
    <main className="codiff-web-page codiff-web-stats">
      <header className="codiff-web-stats-title">
        <h1>Codiff Usage</h1>
      </header>
      <div className="codiff-web-stats-totals">
        <section>
          <strong>{number.format(stats.totalWalkthroughs)}</strong>
          <span>Walkthrough Shares</span>
        </section>
        <section>
          <strong>{number.format(stats.totalPlans)}</strong>
          <span>Plans</span>
        </section>
      </div>
      <StatsChart days={stats.days} maximum={Math.max(1, stats.maxDailyShares)} />
    </main>
  );
};

const StatsRequest = () => {
  const { sharingStats } = useRequest({
    sharingStats: {
      view: ShareStatsView,
    },
  });

  return sharingStats ? <StatsContent stats={sharingStats} /> : null;
};

const StatsLoading = () => (
  <main className="codiff-web-page codiff-web-stats">
    <div className="codiff-web-stats-loading" role="status" />
  </main>
);

export default function StatsPage() {
  usePageTitle('Usage');

  return (
    <ErrorBoundary
      fallbackRender={() => (
        <main className="codiff-web-page codiff-web-stats">
          <div className="codiff-web-stats-error">Unable to load sharing statistics.</div>
        </main>
      )}
    >
      <Suspense fallback={<StatsLoading />}>
        <StatsRequest />
      </Suspense>
    </ErrorBoundary>
  );
}
