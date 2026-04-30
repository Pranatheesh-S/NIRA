import { useRef, useState } from "react";
import { validateImageFile } from "../../services/ocrService";

export default function ImageUpload({ onSelect, preview }) {
  const inputRef      = useRef(null);
  const [error, setError] = useState("");

  function handleChange(e) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { setError(err); e.target.value = ""; return; }
    setError("");
    onSelect(file);
  }

  function handleClear() {
    if (inputRef.current) inputRef.current.value = "";
    onSelect(null);
    setError("");
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
        Upload Image / Diagram
      </p>

      {!preview ? (
        <label
          htmlFor="image-upload"
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-300 hover:border-emerald-400 bg-gray-50 hover:bg-emerald-50/50 transition-all cursor-pointer py-10 px-4 text-center group"
        >
          <div className="w-12 h-12 bg-gray-100 group-hover:bg-emerald-100 rounded-2xl flex items-center justify-center text-2xl transition-colors">🖼️</div>
          <div>
            <p className="text-sm font-semibold text-gray-700 group-hover:text-emerald-700 transition-colors">
              Click to upload image
            </p>
            <p className="text-xs text-gray-400 mt-1">JPEG · PNG · WebP · BMP · GIF · max 10 MB</p>
          </div>
          <input
            id="image-upload" ref={inputRef}
            type="file" accept="image/*"
            className="sr-only"
            onChange={handleChange}
          />
        </label>
      ) : (
        <div className="relative rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-gray-50 group">
          <img src={preview} alt="Uploaded preview" className="w-full max-h-60 object-contain" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          <button
            type="button"
            onClick={handleClear}
            className="absolute top-3 right-3 rounded-full bg-white border border-gray-200 text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600 w-8 h-8 flex items-center justify-center text-sm shadow-md transition-colors cursor-pointer"
            title="Remove image"
          >
            ✕
          </button>
          <div className="absolute bottom-3 left-3">
            <span className="text-xs font-semibold bg-black/50 text-white rounded-full px-2.5 py-1 backdrop-blur-sm">
              ✓ Image ready
            </span>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>
      )}
    </div>
  );
}
