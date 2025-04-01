"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

type MediaItem = {
  fileKey: string;
  fileType: string;
  url: string;
  uploadDate: string;
  pinned?: boolean | string;
  previewKey?: string;
  previewUrl?: string;
};

export default function Dashboard() {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const router = useRouter();

  const [pinnedImages, setPinnedImages] = useState<MediaItem[]>([]);
  const [pinnedLoading, setPinnedLoading] = useState<boolean>(true);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [userName, setUserName] = useState<string>("");
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/");
    } else {
      // Retrieve user's name from localStorage (or decode your token)
      
      
      const name = localStorage.getItem("email") || "User";
      setUserName(name);
    }
  }, [router]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter((file) =>
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
    files.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await response.json();
      setMessage(data.message);
      setFiles([]);
      const fileList =
        data.files && data.files.length > 0
          ? data.files.map((f: { fileKey: string }) => f.fileKey).join(", ")
          : "No files received";
      toast.success(`Upload successful: ${fileList}`);
      await refreshPinnedImages();
    } catch (err) {
      setError((err as Error).message || "Upload failed");
      toast.error((err as Error).message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPinnedImages();
  }, []);

  const fetchPinnedImages = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/");
      return;
    }
    setPinnedLoading(true);
    try {
      const res = await fetch("/api/media?pinned=true", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        // If the token expired or is invalid, clear it and redirect to login.
        localStorage.removeItem("token");
        router.push("/");
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch pinned images");
      }

      const data: MediaItem[] = await res.json();
      console.log("Raw API response:", data);

      const pinnedList = data.filter((item) => {
        const isPinned =
          item.pinned === true ||
          (typeof item.pinned === "string" && item.pinned.toLowerCase() === "true");
        return isPinned;
      });
      setPinnedImages(pinnedList);
      console.log("Pinned images set:", pinnedList);
    } catch (err) {
      console.error("Fetch pinned images error:", err);
      toast.error((err as Error).message || "Failed to load pinned images");
    } finally {
      setPinnedLoading(false);
    }
  };

  const refreshPinnedImages = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch("/api/media?pinned=true", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch pinned images");
      }
      const data: MediaItem[] = await res.json();
      const pinnedList = data.filter((item) => {
        const isPinned =
          item.pinned === true ||
          (typeof item.pinned === "string" && item.pinned.toLowerCase() === "true");
        return isPinned;
      });
      setPinnedImages(pinnedList);
    } catch (err) {
      console.error("Refresh pinned images error:", err);
      toast.error((err as Error).message || "Failed to load pinned images");
    }
  };

  const handleUnpin = async (fileKey: string) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const response = await fetch(`/api/media/unpin?fileKey=${fileKey}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to unpin image");
      }
      setPinnedImages((prev) => prev.filter((img) => img.fileKey !== fileKey));
      toast.success("Image unpinned successfully");
      await refreshPinnedImages();
    } catch (err) {
      console.error(err);
      toast.error((err as Error).message || "Failed to unpin image");
    }
  };

  const handleNext = useCallback(() => {
    if (!selectedMedia) return;
    const currentIndex = pinnedImages.findIndex(
      (item) => item.fileKey === selectedMedia.fileKey
    );
    const nextIndex = (currentIndex + 1) % pinnedImages.length;
    setSelectedMedia(pinnedImages[nextIndex]);
  }, [selectedMedia, pinnedImages]);

  const handlePrevious = useCallback(() => {
    if (!selectedMedia) return;
    const currentIndex = pinnedImages.findIndex(
      (item) => item.fileKey === selectedMedia.fileKey
    );
    const prevIndex = (currentIndex - 1 + pinnedImages.length) % pinnedImages.length;
    setSelectedMedia(pinnedImages[prevIndex]);
  }, [selectedMedia, pinnedImages]);

  const handleDelete = async () => {
    if (!selectedMedia) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const response = await fetch(`/api/media/delete?fileKey=${selectedMedia.fileKey}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete media");
      }
      setPinnedImages((prev) => prev.filter((img) => img.fileKey !== selectedMedia.fileKey));
      toast.success("Media deleted successfully");
      setSelectedMedia(null);
      await refreshPinnedImages();
    } catch (err) {
      console.error(err);
      toast.error((err as Error).message || "Failed to delete media");
    }
  };

  const handlePin = async () => {
    if (!selectedMedia) return;
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const response = await fetch(`/api/media/pin?fileKey=${selectedMedia.fileKey}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to pin media");
      }
      setPinnedImages((prev) =>
        prev.map((img) =>
          img.fileKey === selectedMedia.fileKey ? { ...img, pinned: true } : img
        )
      );
      toast.success("Media pinned successfully");
      await refreshPinnedImages();
    } catch (err) {
      console.error(err);
      toast.error((err as Error).message || "Failed to pin media");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 space-y-8">
      <ToastContainer />

      <h1 className="text-3xl font-bold mb-4">
        Welcome, {userName}!
      </h1>

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
              <svg
                className="animate-spin h-5 w-5 mr-3 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8z"
                ></path>
              </svg>
              Uploading...
            </>
          ) : (
            "Upload"
          )}
        </button>
      </form>

      <div className="w-full max-w-4xl bg-white p-6 rounded shadow-md">
        <h2 className="text-2xl font-bold mb-4 text-center">My Pinned Images</h2>
        {pinnedLoading ? (
          <p className="text-center">Loading pinned images...</p>
        ) : pinnedImages.length === 0 ? (
          <p className="text-center">No pinned images found.</p>
        ) : (
          <div className="max-w-screen-xl mx-auto grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
            {pinnedImages.map((img) => (
              <div
                key={img.fileKey}
                className="relative w-full aspect-square cursor-pointer"
                onClick={() => setSelectedMedia(img)}
              >
                <Image
                  src={img.previewUrl || img.url} // use the signed URL if available
                  alt={img.fileKey}
                  fill
                  className="object-cover rounded"
                  onError={() => console.log(`Image load error for ${img.url}`)}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnpin(img.fileKey);
                  }}
                  className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full"
                >
                  Unpin
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedMedia && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={() => setSelectedMedia(null)}
        >
          <div
            ref={modalRef}
            className="relative bg-white p-4 rounded max-w-3xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="absolute left-2 top-1/2 transform -translate-y-1/2 z-50"
              onClick={(e) => {
                e.stopPropagation();
                handlePrevious();
              }}
            >
              <button className="bg-gray-700 text-white p-2 rounded-full">‹</button>
            </div>
            <div
              className="absolute right-2 top-1/2 transform -translate-y-1/2 z-50"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
            >
              <button className="bg-gray-700 text-white p-2 rounded-full">›</button>
            </div>
            <div className="absolute top-2 right-2 flex space-x-2 z-50">
              <button
                onClick={handleDelete}
                className="bg-red-500 text-white p-2 rounded hover:bg-red-600"
              >
                Delete
              </button>
              {selectedMedia.pinned === true ||
              (typeof selectedMedia.pinned === "string" &&
                selectedMedia.pinned.toLowerCase() === "true") ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnpin(selectedMedia.fileKey);
                  }}
                  className="bg-red-500 text-white p-2 rounded hover:bg-red-600"
                >
                  Unpin
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePin();
                  }}
                  className="bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
                >
                  Pin
                </button>
              )}
              <button
                onClick={() => setSelectedMedia(null)}
                className="bg-gray-500 text-white p-2 rounded hover:bg-gray-600"
              >
                Close
              </button>
            </div>
            {selectedMedia.fileType.startsWith("image") ? (
              <Image
                src={selectedMedia.url}
                alt={selectedMedia.fileKey}
                layout="responsive"
                width={500}
                height={500}
                className="w-full h-auto max-h-[80vh] object-contain"
              />
            ) : selectedMedia.fileType.startsWith("video") ? (
              <video
                src={selectedMedia.url}
                controls
                className="w-full h-auto max-h-[80vh] object-contain"
              />
            ) : null}
            <p className="mt-2 text-sm text-gray-600 text-center">
              {selectedMedia.fileKey} <br />
              Uploaded: {new Date(selectedMedia.uploadDate).toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
