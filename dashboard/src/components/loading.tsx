export const LoadingSkeleton = ({ h }: { h: number }) => {
  return <div className={`h-[${h}px] bg-gray-300 rounded animate-pulse`} />;
};
