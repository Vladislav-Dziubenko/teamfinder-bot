from aiogram.fsm.state import State, StatesGroup


class ProfileForm(StatesGroup):
    game = State()
    nickname = State()
    rank = State()
    role = State()
    playtime = State()
    looking_for = State()
    region = State()
    contact = State()
    has_mic = State()
    description = State()
