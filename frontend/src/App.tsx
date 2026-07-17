import { Toaster } from 'react-hot-toast';
import { Sparkles, Zap } from 'lucide-react';
import Dashboard from './pages/Dashboard';

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-light">
      {/* Animated background elements - MORE SUBTLE FOR LIGHT THEME */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-300/30 rounded-full blur-3xl animate-pulse-glow"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-300/30 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: '1.5s' }}></div>
        <div className="absolute top-1/2 right-0 w-96 h-96 bg-cyan-300/20 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: '2.5s' }}></div>
        <div className="absolute -bottom-32 left-1/2 w-80 h-80 bg-blue-300/25 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: '0.5s' }}></div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b-2 border-purple-200/50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-vibrant rounded-xl blur opacity-60 group-hover:opacity-100 transition duration-500 group-hover:duration-200"></div>
                <div className="relative bg-white px-3 py-2 rounded-xl shadow-lg overflow-hidden">
                  <div className="animate-float">
                    <img src="/logo.webp" alt="VidSpa Logo" className="w-8 h-6 object-cover rounded" />
                  </div>
                </div>
              </div>
              <div>
                <h1 className="text-4xl font-black text-gradient">
                  VidSpa
                </h1>
                <p className="text-sm text-gray-600 font-medium">Crea videos profesionales con IA</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-100 to-pink-100 rounded-full shadow-md">
              <Zap className="w-5 h-5 text-yellow-600" />
              <span className="text-sm font-semibold text-gray-700">Powered by AI33Pro</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Dashboard />
      </main>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'white',
            color: '#1f2937',
            border: '2px solid #e9d5ff',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          },
          success: {
            style: {
              background: 'linear-gradient(to right, #dcfce7, #dbeafe)',
              border: '2px solid #86efac',
            },
          },
          error: {
            style: {
              background: 'linear-gradient(to right, #fee2e2, #fecaca)',
              border: '2px solid #fca5a5',
            },
          },
        }}
      />
    </div>
  );
}
