export default function LoadingSpinner({ text = 'Načítám data...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-ris3-gray-500">
      <div className="w-8 h-8 border-3 border-ris3-gray-200 border-t-ris3-blue rounded-full animate-spin" />
      <p className="mt-4 text-sm">{text}</p>
    </div>
  )
}
