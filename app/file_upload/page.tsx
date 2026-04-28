import FileUpload from '@/app/file_upload/file_upload';

export default function TestUploadPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl space-y-12 text-center">
        <div className="space-y-4">
          <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight">
            File Upload <span className="text-blue-500">Module</span>
          </h1>
          <p className="text-white/60 text-lg max-w-2xl mx-auto">
            A premium, reusable component for your hackathon projects.
            Perfect for resumes, notes, and document tools.
          </p>
        </div>

        <div className="relative">
          {/* Decorative background glow */}
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>

          <div className="relative bg-[#111] border border-white/10 rounded-3xl overflow-hidden">
            <FileUpload />
          </div>
        </div>
      </div>
    </main>
  );
}
