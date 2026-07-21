import {
  Line,
  LineChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney } from '../ui/format';

export function SensitivityChart({
  data,
  breakeven,
}: {
  data: Array<{
    offerRate: number;
    netProfit: number;
    customerInvoice?: number;
    customerAdvantage?: number;
  }>;
  breakeven: number;
}) {
  if (data.length === 0) return <div className="chart-empty">Grafik için veri yok.</div>;
  return (
    <div className="chart-container sensitivity">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 14, right: 12, bottom: 4, left: 12 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="offerRate" unit="%" />
          <YAxis tickFormatter={(value: number) => `${Math.round(value / 1000)}K`} />
          <Tooltip
            formatter={(value) => formatMoney(Number(value))}
            labelFormatter={(label) => `Teklif oranı %${label}`}
          />
          <ReferenceLine y={0} stroke="#7c8b8f" />
          <ReferenceLine
            x={breakeven}
            stroke="#e09b35"
            strokeDasharray="5 4"
            label={{ value: 'Başabaş', fill: '#9c6a1d', position: 'insideTopRight' }}
          />
          <Line
            type="monotone"
            dataKey="netProfit"
            name="EPSAŞ net kârı"
            stroke="#147d68"
            strokeWidth={3}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
