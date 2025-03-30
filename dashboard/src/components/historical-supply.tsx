import { AreaChart, Area, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  {
    ts: 1743361348,
    supply: 2400000.23,
  },
  {
    ts: 1743363448,
    supply: 2210000.23,
  },
  {
    ts: 1743365448,
    supply: 2290000.23,
  },
];

export const HistoricalSupply = () => {
  return (
    <div className="w-full h-70">
      <div className="text-2xl">$M Supply</div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          width={500}
          height={400}
          data={data}
          margin={{
            top: 20,
            bottom: 50,
            right: 40,
            left: -10,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <YAxis
            domain={[0, 'dataMax']}
            tickFormatter={(value: number) => Intl.NumberFormat('en', { notation: 'compact' }).format(value)}
            className="text-xs"
          />
          <Tooltip content={<CustomTooltip active={false} payload={[]} />} />
          <Area type="monotone" dataKey="supply" stroke="#3b82f680" fill="#3b82f680" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const CustomTooltip = ({ active, payload }: { active: boolean; payload: any[] }) => {
  if (active && payload && payload.length) {
    const { ts, supply } = payload[0].payload;
    return (
      <div className="bg-white p-2 shadow-md">
        <p className="text-xs">{new Date(ts * 1000).toLocaleString()}</p>
        <p>{Intl.NumberFormat('en', { style: 'currency', currency: 'USD' }).format(supply)}</p>
      </div>
    );
  }

  return null;
};
