import { useRef, type ReactNode } from "react";
import { Upload, X } from "lucide-react";
import { compressImage } from "@/storage";

interface Props {
  image: string;
  onChange: (img: string) => void;
  className?: string;
  rounded?: string;
  placeholder?: string;
  children?: ReactNode;
}

export function ImageUpload({ image, onChange, className = "", rounded = "rounded-lg", placeholder = "อัปโหลดรูป", children }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div className={`relative group ${className}`}>
      {image ? (
        <>
          <img src={image} alt="" className={`w-full h-full object-cover ${rounded}`} />
          <button
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            className="absolute top-1 right-1 bg-red-600/80 hover:bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition"
          >
            <X size={12} />
          </button>
        </>
      ) : (
        <button
          onClick={() => ref.current?.click()}
          className={`w-full h-full border-2 border-dashed border-slate-600 hover:border-cyan-400 hover:bg-slate-800/50 flex flex-col items-center justify-center text-slate-500 hover:text-cyan-400 transition ${rounded}`}
        >
          <Upload size={20} />
          <span className="text-xs mt-1">{placeholder}</span>
        </button>
      )}
      {image && children}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            try {
              onChange(await compressImage(file));
            } catch {
              alert("อ่านรูปไม่ได้ ลองใช้ไฟล์รูปอื่น (jpg/png)");
            }
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
