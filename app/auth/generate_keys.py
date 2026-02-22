"""Generate an RSA key pair for RS256 JWT signing.

Usage:
    python -m app.auth.generate_keys

Outputs PEM-encoded private and public keys to stdout.
Copy the values into your .env as JWT_PRIVATE_KEY and JWT_PUBLIC_KEY.
"""

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa


def main() -> None:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()

    public_pem = (
        private_key.public_key()
        .public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )

    print("# --- RSA Private Key (JWT_PRIVATE_KEY) ---")
    print(private_pem)
    print("# --- RSA Public Key (JWT_PUBLIC_KEY) ---")
    print(public_pem)


if __name__ == "__main__":
    main()
