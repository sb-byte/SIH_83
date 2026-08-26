import uvicorn
import os

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")
    print(f"Starting Unity EOC FastAPI Server on http://127.0.0.1:{port} ...")
    uvicorn.run("backend.app.main:app", host=host, port=port, reload=True)
