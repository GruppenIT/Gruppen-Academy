from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SSOAuthorizeResponse(BaseModel):
    authorize_url: str
    state: str


class SSOCallbackRequest(BaseModel):
    code: str
    state: str
