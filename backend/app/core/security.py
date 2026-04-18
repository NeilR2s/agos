from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import firebase_admin
from firebase_admin import auth
from google.auth.credentials import AnonymousCredentials
from app.core.config import settings

# Initialize Firebase Admin SDK
try:
    firebase_admin.get_app()
except ValueError:
    # Uses anonymous credentials because we only need to verify tokens locally
    # In a real setup, provide a valid service account if calling other Firebase services
    firebase_admin.initialize_app(
        credential=AnonymousCredentials(),
        options={"projectId": settings.FIREBASE_PROJECT_ID}
    )

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)

def get_current_user(token: str = Depends(oauth2_scheme)):
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if settings.DEV_BYPASS_ENABLED and settings.DEV_ADMIN_TOKEN and token == settings.DEV_ADMIN_TOKEN:
        return {
            "uid": "dev-admin",
            "email": "dev@admin.com",
            "name": "Dev Admin"
        }

    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception as e:
        # Log the actual error internally to prevent information exposure to the client
        import logging
        logging.getLogger(__name__).warning(f"Authentication failed: {e}")
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
