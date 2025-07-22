from pydantic import BaseModel

class SystemStatus(BaseModel):
    status: str
    containers: dict = {}
