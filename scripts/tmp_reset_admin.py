from backend.db.postgres import SessionLocal
from backend.db.models import User
from backend.services.auth import auth_service

def reset_admin_password():
    db = SessionLocal()
    user = db.query(User).filter(User.email == "user1@test.com").first()
    if user:
        user.password_hash = auth_service.hash_password("admin123")
        db.commit()
        print("Password reset successfully for admin@company.com")
    else:
        print("User admin@company.com not found")
    db.close()

if __name__ == "__main__":
    reset_admin_password()
