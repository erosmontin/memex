"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image"; // Import the Image component

type MediaItem = {
  fileKey: string;
  fileType: string;
  uploadDate: string;
  uploadedBy: string;
  url: string;
};

export default function GalleryPage() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const router = useRouter();

  const fetchMedia = async () => {
    console.log("Fetching media from /api/media");
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/media", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      console.log("Fetch response status:", response.status);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch media");
      }
      const data = await response.json();
      console.log("Fetched media data:", data);
      setMedia(data);
    } catch (err) {
      console.error("Fetch error:", err);
      setError((err as Error).message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log("Gallery page useEffect triggered");
    const token = localStorage.getItem("token");
    console.log("Token in localStorage:", token ? "Yes" : "No");

    if (!token) {
      console.log("No token found, redirecting to login");
      try {
        router.push("/");
      } catch (err) {
        console.error("Router push error:", err);
      }
      return;
    }

    setTimeout(() => {
      fetchMedia();
    }, 100);
  }, [router]);

  const openModal = (item: MediaItem) => {
    setSelectedMedia(item);
  };

  const closeModal = () => {
    console.log("Closing modal, setting selectedMedia to null");
    setSelectedMedia(null);
  };

  const handleDelete = async (fileKey: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
  
    console.log("Attempting to delete item with fileKey:", fileKey); // Add this log
  
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fileKey }),
      });
  
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        let errorData;
        if (contentType && contentType.includes("application/json")) {
          errorData = await response.json();
          throw new Error(errorData.error || "Failed to delete item");
        } else {
          const text = await response.text();
          console.error("Non-JSON response from /api/delete:", text);
          throw new Error(`Failed to delete item: Server returned status ${response.status}`);
        }
      }
  
      await fetchMedia();
    } catch (err) {
      console.error("Delete error:", err);
      setError((err as Error).message || "An error occurred");
    }
  };
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (error) {
    return <div className="min-h-screen flex items-center justify-center text-red-500">{error}</div>;
  }

  return (
    <div className="min-h-screen p-8 bg-gray-100">
      <h1 className="text-3xl font-bold text-center mb-8">My Media Gallery</h1>
      <button
        onClick={() => {
          try {
            router.push("/dashboard");
          } catch (err) {
            console.error("Router push error on back button:", err);
          }
        }}
        className="mb-4 bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
      >
        Back to Dashboard
      </button>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {media.length === 0 ? (
          <p className="text-center col-span-full">
            No media found. Upload some images or videos from the dashboard!
          </p>
        ) : (
          media.map((item) => (
            <div key={item.fileKey} className="bg-white p-4 rounded shadow-md">
              <div
                className="cursor-pointer"
                onClick={() => openModal(item)}
              >
                {item.fileType === "image" ? (
                  <Image
                    src={item.url}
                    alt={item.fileKey}
                    width={500} // Set a reasonable width
                    height={300} // Set a reasonable height
                    className="w-full h-48 object-cover rounded"
                    unoptimized // Disable optimization for S3 images (optional)
                  />
                ) : (
                  <video
                    src={item.url}
                    className="w-full h-48 object-cover rounded"
                    muted
                  />
                )}
                <p className="mt-2 text-sm text-gray-600">
                  {item.fileKey} <br />
                  Uploaded: {new Date(item.uploadDate).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => handleDelete(item.fileKey)}
                className="mt-2 bg-red-500 text-white p-2 rounded hover:bg-red-600 w-full"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>

      {/* Modal for viewing full media */}
      {selectedMedia && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              console.log("Clicked outside modal, closing");
              closeModal();
            }
          }}
        >
          <div className="relative bg-white p-4 rounded max-w-3xl w-full">
            <button
              onClick={() => {
                console.log("Close button clicked");
                closeModal();
              }}
              className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded hover:bg-red-600 z-50"
            >
              Close
            </button>
            {selectedMedia.fileType === "image" ? (
              <Image
                src={selectedMedia.url}
                alt={selectedMedia.fileKey}
                width={800} // Set a reasonable width for the modal
                height={600} // Set a reasonable height for the modal
                className="w-full h-auto max-h-[80vh] object-contain"
                unoptimized // Disable optimization for S3 images (optional)
              />
            ) : (
              <div className="relative">
                <video
                  src={selectedMedia.url}
                  controls
                  className="w-full h-auto max-h-[80vh] object-contain z-0"
                />
                <div className="absolute inset-0 z-10" />
              </div>
            )}
            <p className="mt-2 text-sm text-gray-600 text-center">
              {selectedMedia.fileKey} <br />
              Uploaded: {new Date(selectedMedia.uploadDate).toLocaleString()} <br />
              <span className="text-green-500">
                This file is safely stored in the cloud. You can delete the local copy from your device to free up space.
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}