"""QR code generation and reading utilities for journey PDFs.

Each printed page gets a short alphanumeric code (e.g. 'A7K3MX') that is:
  - stored in the page_codes table (→ journey_id, user_id, page_number)
  - encoded in a QR code (large, Level H — scannable even from photos)
  - printed as large text next to the QR (OCR-friendly fallback)

On scan, the system tries (in order):
  1. pyzbar QR detection → read code → DB lookup
  2. OCR the printed code text → DB lookup
  3. Legacy OCR header parsing (no codes at all)
"""

import io
import logging
import re
import secrets
import string

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Code generation
# ---------------------------------------------------------------------------

# Alphabet: uppercase + digits, excluding visually ambiguous chars (0/O, 1/I/L)
_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_CODE_LENGTH = 6  # 30^6 ≈ 729 million codes — plenty


def generate_code() -> str:
    """Generate a random 6-char alphanumeric code (unambiguous charset)."""
    return "".join(secrets.choice(_ALPHABET) for _ in range(_CODE_LENGTH))


# Regex to find a page code in OCR text (prefix GA- optional for robustness)
_CODE_PATTERN = re.compile(r"(?:GA[- ]?)?([" + re.escape(_ALPHABET) + r"]{6})")


def extract_code_from_text(text: str) -> str | None:
    """Try to find a page code in OCR-extracted text.

    Looks for the 6-char code, optionally prefixed with 'GA-'.
    """
    for match in _CODE_PATTERN.finditer(text.upper()):
        candidate = match.group(1)
        # Extra check: must not be a common English/Portuguese word
        if len(candidate) == _CODE_LENGTH:
            return candidate
    return None


# ---------------------------------------------------------------------------
# QR image generation
# ---------------------------------------------------------------------------


def generate_qr_image(code: str) -> bytes:
    """Generate a QR code PNG encoding just the short code.

    Uses Level H error correction (30% damage tolerance) and large box size
    for reliable scanning even from phone photos.
    """
    import qrcode

    qr = qrcode.QRCode(
        version=2,  # fixed small version since payload is only 6 chars
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=12,
        border=3,
    )
    qr.add_data(code)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Fiducial corner markers
# ---------------------------------------------------------------------------

MARKER_SIZE_MM = 5


def draw_corner_markers(pdf, margin: float = 5.0):
    """Draw four solid black squares at page corners as fiducial markers."""
    s = MARKER_SIZE_MM
    pw = pdf.w
    ph = pdf.h

    pdf.set_fill_color(0, 0, 0)
    pdf.set_draw_color(0, 0, 0)

    pdf.rect(margin, margin, s, s, style="F")
    pdf.rect(pw - margin - s, margin, s, s, style="F")
    pdf.rect(margin, ph - margin - s, s, s, style="F")
    pdf.rect(pw - margin - s, ph - margin - s, s, s, style="F")


# ---------------------------------------------------------------------------
# QR reading from scanned images
# ---------------------------------------------------------------------------


def read_qr_from_image(pil_image) -> str | None:
    """Attempt to read a page code from a QR code in a PIL Image.

    Returns the code string or None.
    """
    try:
        from pyzbar.pyzbar import decode as pyzbar_decode

        results = pyzbar_decode(pil_image)
        for obj in results:
            if obj.type == "QRCODE":
                data = obj.data.decode("utf-8", errors="replace").strip()
                # The QR contains just the 6-char code
                if len(data) >= _CODE_LENGTH:
                    # Extract the code from the QR data
                    cleaned = data.upper().replace("-", "").replace(" ", "")
                    if len(cleaned) >= _CODE_LENGTH:
                        return cleaned[:_CODE_LENGTH]
    except Exception as e:
        logger.debug("pyzbar decode failed: %s", e)
    return None


def read_codes_from_pdf_pages(file_path: str) -> list[str | None]:
    """Try to read page codes from each page of a scanned PDF.

    Attempts QR detection first; if that fails for a page, tries OCR text
    extraction to find the printed code.

    Returns a list (one entry per page) of code strings or None.
    """
    try:
        from pdf2image import convert_from_path

        images = convert_from_path(file_path, dpi=300)
    except Exception as e:
        logger.error("Failed to convert PDF to images for code reading: %s", e)
        return []

    results = []
    for i, img in enumerate(images):
        # Strategy 1: QR code
        code = read_qr_from_image(img)
        if code:
            logger.info("QR code detected on page %d: %s", i, code)
            results.append(code)
            continue

        # Strategy 2: OCR the bottom-right region where the code is printed
        try:
            import pytesseract

            # Crop bottom-right quadrant (where QR + code label are)
            w, h = img.size
            crop = img.crop((w // 2, int(h * 0.75), w, h))
            ocr_text = pytesseract.image_to_string(crop, config="--psm 6")
            code = extract_code_from_text(ocr_text)
            if code:
                logger.info("OCR code detected on page %d: %s", i, code)
                results.append(code)
                continue
        except Exception as e:
            logger.debug("OCR code extraction failed on page %d: %s", i, e)

        results.append(None)

    return results
