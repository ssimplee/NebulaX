"""Generate a local Web Push VAPID private key (ignored by Git)."""

from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

target = Path(__file__).parents[1] / "instance" / "vapid_private.pem"
target.parent.mkdir(parents=True, exist_ok=True)
if target.exists():
    print(f"VAPID key already exists: {target}")
else:
    private_key = ec.generate_private_key(ec.SECP256R1())
    target.write_bytes(private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ))
    print(f"Created VAPID key: {target}")

