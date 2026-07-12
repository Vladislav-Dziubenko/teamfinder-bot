import asyncio
import os
from database import Database

async def test_database():
    test_db_path = "test_teamfinder.db"
    
    # Remove test database if exists
    if os.path.exists(test_db_path):
        os.remove(test_db_path)
    
    db = Database(test_db_path)
    await db.connect()
    
    print("Testing database migration and new methods...")
    
    # Test user creation and PRO status
    await db.ensure_user(12345, "testuser", "Test")
    print("✓ User created")
    
    is_pro = await db.is_pro(12345)
    assert not is_pro, "User should not be PRO initially"
    print("✓ User is not PRO initially")
    
    await db.set_pro_status(12345, days=30)
    print("✓ PRO status set")
    
    is_pro = await db.is_pro(12345)
    assert is_pro, "User should be PRO after setting status"
    print("✓ User is PRO after activation")
    
    # Test profile creation
    await db.save_profile({
        "user_id": 12345,
        "game": "CS2",
        "nickname": "TestPlayer",
        "rank": "Global",
        "role": "AWP",
        "playtime": "1000h",
        "looking_for": "Team",
        "contact": "test@contact.com"
    })
    print("✓ Profile created")
    
    profile = await db.get_profile(12345)
    assert profile is not None, "Profile should exist"
    profile_id = profile["id"]
    print(f"✓ Profile retrieved with ID: {profile_id}")
    
    # Test contact unlock
    await db.unlock_contact(67890, profile_id)
    print("✓ Contact unlock recorded")
    
    has_unlocked = await db.has_unlocked_contact(67890, profile_id)
    assert has_unlocked, "Contact should be unlocked"
    print("✓ Contact unlock verified")
    
    # Test team creation
    team_id = await db.create_team(
        captain_id=12345,
        game="CS2",
        name="Test Team",
        description="Test description",
        max_players=5
    )
    print(f"✓ Team created with ID: {team_id}")
    
    team = await db.get_team(team_id)
    assert team is not None, "Team should exist"
    assert team["name"] == "Test Team", "Team name should match"
    print("✓ Team retrieved correctly")
    
    # Test team listing
    teams = await db.list_teams("CS2")
    assert len(teams) == 1, "Should have one team for CS2"
    print("✓ Team listing works")
    
    # Test team applications
    app_id = await db.apply_to_team(team_id, 67890, "I want to join!")
    print(f"✓ Application created with ID: {app_id}")
    
    applications = await db.get_team_applications(team_id)
    assert len(applications) == 1, "Should have one application"
    print("✓ Team applications retrieved")
    
    # Test application status update
    await db.update_application_status(app_id, "accepted")
    print("✓ Application status updated")
    
    applications = await db.get_team_applications(team_id, "accepted")
    assert len(applications) == 1, "Should have one accepted application"
    print("✓ Filtered applications work")
    
    # Test user applications
    user_apps = await db.get_user_applications(67890)
    assert len(user_apps) == 1, "User should have one application"
    print("✓ User applications retrieved")
    
    # Test stats
    stats = await db.stats()
    assert stats["users"] == 2, "Should have 2 users"
    assert stats["profiles"] == 1, "Should have 1 profile"
    print(f"✓ Stats: {stats}")
    
    await db.close()
    
    # Clean up
    os.remove(test_db_path)
    print("✓ Test database cleaned up")
    
    print("\n✅ All database tests passed!")

if __name__ == "__main__":
    asyncio.run(test_database())
