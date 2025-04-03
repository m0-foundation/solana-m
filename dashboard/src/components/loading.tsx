export const LoadingSkeleton = ({ h }: { h: number }) => {
  return <div className={`w-full h-${h} bg-gray-300 rounded animate-pulse`} />;
};
