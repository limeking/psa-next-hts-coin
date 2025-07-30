from fastapi import APIRouter

router = APIRouter(prefix="/coinlab")

@router.get("/")
def coinlab_ping():
    return {"msg": "Coinlab API OK"}
