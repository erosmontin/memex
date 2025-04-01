"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

type MediaItem = {
  fileKey: string;
  fileType: string;
  uploadDate: string;
  uploadedBy: string;
  url: string;
  pinned?: boolean;
  previewUrl?: string;
};

export default function GalleryPage() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const router = useRouter();
  const modalRef = useRef<HTMLDivElement>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const LIMIT = 12;

  // Fetch media with pagination
  const fetchMedia = useCallback(async () => {
    setIsFetching(true);
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/");
      return;
    }
    try {
      const response = await fetch(`/api/media?page=${page}&limit=${LIMIT}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        let errorData;
        if (contentType && contentType.includes("application/json")) {
          errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch media");
        } else {
          const text = await response.text();
          throw new Error(`Failed to fetch media: ${text}`);
        }
      }
      const data: MediaItem[] = await response.json();

      setMedia((prev) => {
        const combined = page === 1 ? data : [...prev, ...data];
        const unique = combined.filter(
          (item, index, self) =>
            index === self.findIndex((t) => t.fileKey === item.fileKey)
        );
        unique.sort(
          (a, b) =>
            new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
        );
        return unique;
      });

      if (data.length < LIMIT) {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError((err as Error).message || "An error occurred");
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  }, [page, router]);

  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  const openModal = (item: MediaItem) => {
    setSelectedMedia(item);
  };

  const closeModal = () => {
    setSelectedMedia(null);
  };

  const handleDelete = async () => {
    if (!selectedMedia) return;
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `/api/media?fileKey=${selectedMedia.fileKey}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete media");
      }
      setMedia((prev) =>
        prev.filter((item) => item.fileKey !== selectedMedia.fileKey)
      );
      toast.success("Media deleted successfully");
      closeModal();
    } catch (error) {
      toast.error((error as Error).message || "Delete failed");
    }
  };

  // Focus trapping for accessibility in the modal
  useEffect(() => {
    if (selectedMedia && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement =
        focusableElements[focusableElements.length - 1] as HTMLElement;

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeModal();
        }
        if (e.key === "Tab") {
          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              e.preventDefault();
              lastElement.focus();
            }
          } else {
            if (document.activeElement === lastElement) {
              e.preventDefault();
              firstElement.focus();
            }
          }
        }
      };

      firstElement?.focus();
      document.addEventListener("keydown", handleKeyDown);

      return () => {
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [selectedMedia]);

  const handleNext = () => {
    if (!selectedMedia) return;
    const currentIndex = media.findIndex(
      (item) => item.fileKey === selectedMedia.fileKey
    );
    const nextIndex = (currentIndex + 1) % media.length;
    setSelectedMedia(media[nextIndex]);
  };

  const handlePrevious = () => {
    if (!selectedMedia) return;
    const currentIndex = media.findIndex(
      (item) => item.fileKey === selectedMedia.fileKey
    );
    const prevIndex = (currentIndex - 1 + media.length) % media.length;
    setSelectedMedia(media[prevIndex]);
  };

  const handlePin = async () => {
    if (!selectedMedia) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      const response = await fetch(
        `/api/media/pin?fileKey=${selectedMedia.fileKey}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to pin image");
      }
      setSelectedMedia({ ...selectedMedia, pinned: true });
      setMedia((prev) =>
        prev.map((item) =>
          item.fileKey === selectedMedia.fileKey
            ? { ...item, pinned: true }
            : item
        )
      );
      toast.success("Image pinned successfully");
    } catch (err) {
      console.error(err);
      toast.error((err as Error).message || "Failed to pin image");
    }
  };

  const handleUnpin = async (fileKey: string) => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const response = await fetch(`/api/media/unpin?fileKey=${fileKey}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to unpin image");
      }
      setMedia((prev) =>
        prev.map((item) =>
          item.fileKey === fileKey ? { ...item, pinned: false } : item
        )
      );
      if (selectedMedia && selectedMedia.fileKey === fileKey) {
        setSelectedMedia({ ...selectedMedia, pinned: false });
      }
      toast.success("Image unpinned successfully");
    } catch (err) {
      console.error(err);
      toast.error((err as Error).message || "Failed to unpin image");
    }
  };

  const displayedMedia = media;

  if (loading && page === 1) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-gray-100">
      <ToastContainer />
      <h1 className="text-3xl font-bold text-center mb-8">My Media Gallery</h1>
      <button
        onClick={() => {
          router.push("/dashboard");
        }}
        className="mb-4 bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
      >
        Back to Dashboard
      </button>
      <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-14 gap-2">
        {displayedMedia.length === 0 ? (
          <p className="text-center col-span-full">
            No media found. Upload some images or videos from the dashboard!
          </p>
        ) : (
          displayedMedia.map((item) => (
            <div
              key={item.fileKey}
              className="bg-white p-1 rounded shadow-md cursor-pointer"
              onClick={() => openModal(item)}
            >
              {item.fileType.startsWith("image") ? (
                <div className="relative w-full aspect-square">
                  <Image
                    src={item.previewUrl || item.url}
                    alt={item.fileKey}
                    fill
                    className="object-cover rounded"
                  />
                </div>
              ) : (
                <div className="relative w-full aspect-square">
                  <video
                    src={item.url}
                    className="object-cover rounded h-full w-full"
                    muted
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
      {/* Load More Button */}
      {hasMore && !isFetching && (
        <button
          onClick={() => setPage((prev) => prev + 1)}
          className="mt-4 bg-green-500 text-white p-2 rounded hover:bg-green-600 block mx-auto"
        >
          Load More
        </button>
      )}
      {/* Sentinel element can be removed or commented out if not used */}
      {/* <div ref={sentinelRef} className="h-4" /> */}

      {/* Modal for viewing full media */}
      {selectedMedia && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeModal();
            }
          }}
        >
          <div
            ref={modalRef}
            className="relative bg-white p-4 rounded w-full max-w-[90vw] max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Navigation Buttons */}
            <div
              className="absolute left-2 top-1/2 transform -translate-y-1/2 z-50"
              onClick={(e) => {
                e.stopPropagation();
                handlePrevious();
              }}
            >
              <button className="bg-gray-700 text-white p-2 rounded-full">
                ‹
              </button>
            </div>
            <div
              className="absolute right-2 top-1/2 transform -translate-y-1/2 z-50"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
            >
              <button className="bg-gray-700 text-white p-2 rounded-full">
                ›
              </button>
            </div>

            {/* Pin/Unpin, Delete and Close Buttons */}
            <div className="absolute top-2 right-2 flex space-x-2 z-50">
              <button
                onClick={handleDelete}
                className="bg-red-500 text-white p-2 rounded hover:bg-red-600"
              >
                Delete
              </button>
              {selectedMedia.pinned ? (
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
                onClick={closeModal}
                className="bg-gray-500 text-white p-2 rounded hover:bg-gray-600"
              >
                Close
              </button>
            </div>

            {/* Media Display */}
            {selectedMedia.fileType.startsWith("image") ? (
              <div className="flex items-center justify-center w-full">
                <Image
                  src={selectedMedia.url}
                  alt={selectedMedia.fileKey}
                  width={800} // Provide a base width for aspect ratio
                  height={800} // Provide a base height for aspect ratio
                  className="object-contain rounded max-h-[70vh] max-w-full"
                  sizes="(max-width: 768px) 100vw, 80vw"
                />
              </div>
            ) : (
              <video
                src={selectedMedia.url}
                controls
                className="w-full h-auto max-h-[70vh] object-contain rounded"
              />
            )}

            {/* Social Share Buttons */}
            <div className="flex space-x-2 mt-4 justify-center">
              <a
                href={selectedMedia.url}
                download
                target="_blank"
                rel="noopener noreferrer"
              >
                <button className="bg-purple-600 text-white p-2 rounded hover:bg-purple-700">
                  Download
                </button>
              </a>
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                  "Check out this media: " + selectedMedia.url
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <button className="bg-green-500 text-white p-2 rounded hover:bg-green-600">
                  Share on WhatsApp
                </button>
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
                  selectedMedia.url
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <button className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700">
                  Share on Facebook
                </button>
              </a>
            </div>
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