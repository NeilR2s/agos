from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request

def get_user_id_or_ip(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        # Use the raw token as the rate limit bucket to avoid global IP blocks on auth'd routes
        return auth_header.split(" ")[1]
    return get_remote_address(request)

limiter = Limiter(key_func=get_user_id_or_ip, default_limits=["60/minute"])
