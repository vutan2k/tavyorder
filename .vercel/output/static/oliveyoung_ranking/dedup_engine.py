import hashlib
import urllib.request
import os

def get_clean_image_url(url):
    """Làm sạch URL ảnh về link gốc chất lượng cao nhất"""
    if not url:
        return ""
    base = url.split("?")[0].strip()
    return base

def calculate_file_hash(file_path):
    """Tính mã băm MD5 của file để phát hiện ảnh trùng nội dung"""
    if not os.path.exists(file_path):
        return None
    hasher = hashlib.md5()
    with open(file_path, 'rb') as f:
        buf = f.read(65536)
        while len(buf) > 0:
            hasher.update(buf)
            buf = f.read(65536)
    return hasher.hexdigest()

def check_image_has_face(image_path):
    """Gọi Apple Vision Framework binary để kiểm tra xem ảnh có mặt người không"""
    import subprocess
    bin_path = "/Users/tan/Desktop/oliveyoung_ranking/vision_face_filter"
    if not os.path.exists(bin_path) or not os.path.exists(image_path):
        return False
    try:
        res = subprocess.run([bin_path, image_path], capture_output=True, text=True, timeout=5)
        out = res.stdout.strip()
        if "FACES:" in out:
            count = int(out.split("FACES:")[1].strip())
            return count > 0
    except Exception as e:
        print(f"Lỗi kiểm tra face: {e}")
    return False

def download_and_dedupe_images(url_list, dest_folder, prefix="review", target_count=8, exclude_hashes=None, filter_faces=True):
    """
    Tải danh sách ảnh, tự động loại bỏ ảnh trùng lặp theo mã băm MD5 và loại bỏ ảnh có mặt người.
    Đảm bảo tải đủ target_count ảnh độc bản.
    """
    os.makedirs(dest_folder, exist_ok=True)
    seen_hashes = set(exclude_hashes or [])
    saved_paths = []
    
    for idx, raw_url in enumerate(url_list):
        if len(saved_paths) >= target_count:
            break
        clean_url = get_clean_image_url(raw_url)
        if not clean_url.startswith("http"):
            continue

        temp_path = os.path.join(dest_folder, f"_temp_{idx}.img")
        try:
            req = urllib.request.Request(clean_url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
            with urllib.request.urlopen(req, timeout=12) as resp, open(temp_path, 'wb') as out_f:
                data = resp.read()
                out_f.write(data)
            
            # Kiểm tra định dạng qua magic bytes
            ext = "png" if data.startswith(b"\x89PNG\r\n\x1a\n") else ("jpg" if data.startswith(b"\xff\xd8") else "webp")
            
            # 1. Kiểm tra kích thước file (> 8KB)
            if len(data) < 8000:
                os.remove(temp_path)
                continue

            # 2. Tính MD5 hash của ảnh vừa tải để chống trùng
            file_hash = calculate_file_hash(temp_path)
            if file_hash in seen_hashes:
                os.remove(temp_path)
                continue

            # 3. Lọc mặt người bằng Apple Vision Framework
            if filter_faces and check_image_has_face(temp_path):
                print(f"🚫 [VISION AI] Phát hiện mặt người trong ảnh {clean_url[:40]}... -> Bỏ qua!")
                os.remove(temp_path)
                continue

            seen_hashes.add(file_hash)
            final_name = f"{prefix}_{len(saved_paths) + 1}.{ext}"
            final_path = os.path.join(dest_folder, final_name)
            os.rename(temp_path, final_path)
            saved_paths.append(final_path)
        except Exception as e:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            continue
            
    return saved_paths, seen_hashes
