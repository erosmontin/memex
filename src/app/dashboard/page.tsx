"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function Dashboard() {
  // Changing the state to hold an array of Files
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/"); // Redirect to login if no token
    }
  }, [router]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter(file =>
        file.type.startsWith("image/") || file.type.startsWith("video/")
      );
      if (selectedFiles.length > 0) {
        setFiles(selectedFiles);
        setError(null);
      } else {
        setError("Please select an image or video file");
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      setError("Please select at least one file");
      return;
    }
    
    setLoading(true);
    const token = localStorage.getItem("token");
    const formData = new FormData();
    // Append each file. Change the key 'files' as expected by your backend.
    files.forEach(file => formData.append("files", file));

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await response.json();
      setMessage(data.message);
      setFiles([]); // Clear files after upload

      // List all correctly uploaded file keys in a toast.
      const fileList =
        data.files && data.files.length > 0
          ? data.files.map((f: { fileKey: string }) => f.fileKey).join(", ")
          : "No files received";
      toast.success(`Upload successful: ${fileList}`);
    } catch (err) {
      setError((err as Error).message || "Upload failed");
      toast.error((err as Error).message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
      <ToastContainer />
      <h1 className="text-3xl font-bold mb-8">Welcome to the Dashboard!</h1>
      <button
        onClick={() => router.push("/gallery")}
        className="mb-4 bg-green-500 text-white p-2 rounded hover:bg-green-600"
      >
        View My Gallery
      </button>
      <form onSubmit={handleUpload} className="bg-white p-6 rounded shadow-md w-full max-w-md">
        <div className="mb-4">
          <label
            htmlFor="fileUpload"
            className="block text-gray-700 mb-2 cursor-pointer bg-blue-500 text-white p-2 rounded hover:bg-blue-600 text-center"
          >
            Choose Files
          </label>
          <input
            id="fileUpload"
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
        {error && <p className="text-red-500 mb-4">{error}</p>}
        {message && <p className="text-green-500 mb-4">{message}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 flex justify-center items-center"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5 mr-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
              </svg>
              Uploading...
            </>
          ) : (
            "Upload"
          )}
        </button>
      </form>
    </div>
  );
}