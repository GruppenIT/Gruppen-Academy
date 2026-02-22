"""QR code generation and reading utilities for journey PDFs.

Encodes journey_id + user_id + page number into a compact QR code (Level H)
and provides decoding for scanned PDFs.
"""

import base64
import io
import json
import logging
import uuid

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Encoding / Decoding helpers
# ---------------------------------------------------------------------------

SCHEMA_VERSION = 1


def encode_qr_payload(journey_id: uuid.UUID, user_id: uuid.UUID, page: int) -> str:
    """Encode journey/user/page into a compact JSON string for QR embedding.

    Uses base64url-encoded UUIDs (22 chars each instead of 36) to keep the
    QR code small (fits in Version 4 at Level H).
    """
    j_b64 = base64.urlsafe_b64encode(journey_id.bytes).rstrip(b"=").decode()
    u_b64 = base64.urlsafe_b64encode(user_id.bytes).rstrip(b"=").decode()
    return json.dumps(
        {"j": j_b64, "u": u_b64, "p": page, "v": SCHEMA_VERSION},
        separators=(",", ":"),
    )


def decode_qr_payload(data: str) -> dict | None:
    """Decode a QR payload string back into journey_id, user_id, page.

    Returns dict with uuid.UUID objects, or None if invalid.
    """
    try:
        obj = json.loads(data)
        # Pad base64 back
        j_bytes = base64.urlsafe_b64decode(obj["j"] + "==")
        u_bytes = base64.urlsafe_b64decode(obj["u"] + "==")
        return {
            "journey_id": uuid.UUID(bytes=j_bytes),
            "user_id": uuid.UUID(bytes=u_bytes),
            "page": obj["p"],
            "version": obj.get("v", 1),
        }
    except Exception:
        logger.debug("Failed to decode QR payload: %s", data[:100])
        return None


# ---------------------------------------------------------------------------
# Short code (human-readable fallback)
# ---------------------------------------------------------------------------


def make_short_code(journey_id: uuid.UUID, user_id: uuid.UUID, page: int) -> str:
    """Generate a human-readable short code like GA-A1B2-C3D4-P01.

    Uses first 4 hex chars of each UUID for brevity.
    """
    j_short = journey_id.hex[:4].upper()
    u_short = user_id.hex[:4].upper()
    return f"GA-{j_short}-{u_short}-P{page:02d}"


# ---------------------------------------------------------------------------
# QR image generation
# ---------------------------------------------------------------------------


def generate_qr_image(data: str) -> bytes:
    """Generate a QR code PNG image (in memory) with error correction Level H.

    Returns PNG bytes suitable for fpdf2's pdf.image().
    """
    import qrcode

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=2,
    )
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Fiducial corner markers (simple solid squares — no OpenCV dependency)
# ---------------------------------------------------------------------------

MARKER_SIZE_MM = 5  # size of each corner marker in mm


def draw_corner_markers(pdf, margin: float = 5.0):
    """Draw four solid black squares at page corners as fiducial markers.

    These allow deskewing after scanning by detecting the four reference
    points with simple contour detection (no OpenCV ArUco needed).
    """
    s = MARKER_SIZE_MM
    pw = pdf.w  # page width
    ph = pdf.h  # page height

    pdf.set_fill_color(0, 0, 0)
    pdf.set_draw_color(0, 0, 0)

    # Top-left
    pdf.rect(margin, margin, s, s, style="F")
    # Top-right
    pdf.rect(pw - margin - s, margin, s, s, style="F")
    # Bottom-left
    pdf.rect(margin, ph - margin - s, s, s, style="F")
    # Bottom-right
    pdf.rect(pw - margin - s, ph - margin - s, s, s, style="F")


# ---------------------------------------------------------------------------
# QR reading from scanned images
# ---------------------------------------------------------------------------


def read_qr_from_image(pil_image) -> dict | None:
    """Attempt to decode a QR code from a PIL Image.

    Returns decoded payload dict or None.
    """
    try:
        from pyzbar.pyzbar import decode as pyzbar_decode

        results = pyzbar_decode(pil_image)
        for obj in results:
            if obj.type == "QRCODE":
                data_str = obj.data.decode("utf-8", errors="replace")
                payload = decode_qr_payload(data_str)
                if payload:
                    return payload
    except Exception as e:
        logger.debug("pyzbar decode failed: %s", e)
    return None


def read_qr_from_pdf_pages(file_path: str) -> list[dict | None]:
    """Try to read QR codes from each page of a scanned PDF.

    Returns a list (one entry per page) of decoded payloads or None.
    """
    try:
        from pdf2image import convert_from_path

        images = convert_from_path(file_path, dpi=300)
    except Exception as e:
        logger.error("Failed to convert PDF to images for QR reading: %s", e)
        return []

    results = []
    for i, img in enumerate(images):
        payload = read_qr_from_image(img)
        if payload:
            logger.info("QR decoded on page %d: %s", i, payload)
        results.append(payload)
    return results
