const { Router } = require('express');
const { create, login, getListOfUsers, updateUser, deleteUser } = require('./user.controller.js');

const userRouter = Router();

userRouter.post('/create', create);
userRouter.post('/login', login);
userRouter.get('/list', getListOfUsers);

// Update user (PUT /api/users/:id)
userRouter.put('/:id', updateUser);

// Delete user (DELETE /api/users/:id)
userRouter.delete('/:id', deleteUser);

module.exports = userRouter;
