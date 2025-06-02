'use client';

export default function TailwindTest() {
  return (
    <div className="p-8 bg-white shadow-lg rounded-lg border border-gray-200 max-w-md mx-auto mt-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Tailwind CSS Test</h2>
      <p className="text-gray-600 mb-4">
        If you can see this styled component, Tailwind CSS is working correctly!
      </p>
      <button className="btn-primary w-full">
        Test Button
      </button>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="h-8 bg-blue-500 rounded"></div>
        <div className="h-8 bg-green-500 rounded"></div>
        <div className="h-8 bg-red-500 rounded"></div>
      </div>
    </div>
  );
}