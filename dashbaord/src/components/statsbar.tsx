export const StatsBar = () => {
  return (
    <div className="bg-off-blue px-4 py-5">
      <div className="max-w-6xl mx-auto flex items-center space-x-10">
        <Stat title="$M supply" value="0" />
        <Stat title="$M yield" value="0" />
        <Stat title="$wM supply" value="0" />
      </div>
    </div>
  );
};

const Stat = ({ title, value }: { title: string; value: string }) => {
  return (
    <div className="flex flex-col">
      <span className="text-xs">{title}</span>
      <span className="text-xl font-medium">{value}</span>
    </div>
  );
};
