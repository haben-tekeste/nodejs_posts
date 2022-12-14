const { validationResult } = require("express-validator");
const Post = require("../models/Post");
const User = require("../models/User");
const util = require("../util/util");
const io = require("../socket");

//
const ITEMS_PER_PAGE = 2;

exports.getPosts = (req, res, next) => {
  const currentPage = req.query.page || 1;
  let totalItems;
  Post.countDocuments()
    .then((nbr) => {
      totalItems = nbr;
      return Post.find()
        .populate("creator")
        .sort({createdAt:-1})
        .skip((currentPage - 1) * ITEMS_PER_PAGE)
        .limit(ITEMS_PER_PAGE);
    })
    .then((posts) => {
      // console.log(posts);
      if (!posts) {
        const error = new Error("No post available");
        error.statusCode = 404;
        throw error;
      }
      res.status(200).json({
        message: "Posts fetched successfully",
        posts,
        totalItems,
      });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

exports.createPost = (req, res, next) => {
  const errors = validationResult(req);
  let creator;
  if (!errors.isEmpty()) {
    const error = new Error("Validation failed");
    error.statusCode = 422;
    throw error;
  }

  if (!req.file) {
    const error = new Error("Image not provided");
    error.statusCode = 422;
    throw error;
  }
  const title = req.body.title;
  const content = req.body.content;
  const imageUrl = req.file.path;
  const post = new Post({
    title,
    content,
    creator: req.userId,
    imageUrl,
  });
  post
    .save()
    .then((result) => {
      return User.findById(req.userId);
    })
    .then((user) => {
      if (!user) {
        const error = new Error("No user found");
        error.statusCode = 422;
        throw error;
      }
      creator = user;
      user.posts.push(post);
      return user.save();
    })
    .then((result) => {
      io.getIO().emit("posts", { action: "create", post:{...post._doc,creator:{_id:req.userId,name:creator.name}} });
      res.status(201).json({
        message: "Post created successfully!",
        post,
        creator: {
          id: creator._id,
          name: creator.name,
        },
      });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

exports.getPost = (req, res, next) => {
  const postId = req.params.postId;
  Post.findById(postId)
    .then((post) => {
      if (!post) {
        const error = new Error("Post not found");
        error.statusCode = 404;
        throw error;
      }
      res.status(200).json({
        message: "Post fetched successfully",
        post,
      });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

exports.updatePost = (req, res, next) => {
  const postId = req.params.postId;
  const { title, content } = req.body;
  let imageUrl = req.body.image;

  if (req.file) {
    imageUrl = req.file.path;
  }
  if (!imageUrl) {
    const error = new Error("Something went wrong with image");
    error.statusCode = 404;
    throw error;
  }
  Post.findById(postId)
    .then((post) => {
      if (post.creator.toString() !== req.userId) {
        const error = new Error("Not authorized to perform this operation");
        error.statusCode = 403;
        throw error;
      }
      if (!post) {
        const error = new Error("Post not found");
        error.statusCode = 404;
        throw error;
      }
      if (imageUrl !== post.imageUrl) {
        util.deleteImage(post.imageUrl);
      }
      post.title = title;
      post.content = content;
      post.imageUrl = imageUrl;
      return post.save();
    })
    .then((result) => {
      io.getIO().emit('posts',{action:'update',post:result})
      res.status(200).json({
        message: "Post updated successfuly",
        post: result,
      });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

exports.deletePost = (req, res, next) => {
  const postId = req.params.postId;
  Post.findById(postId)
    .then((post) => {
      if (!post) {
        const error = new Error("Post not found");
        error.statusCode = 404;
        throw error;
      }
      if (post.creator.toString() !== req.userId) {
        const error = new Error("Not authorized to perform this operation");
        error.statusCode = 403;
        throw error;
      }
      util.deleteImage(post.imageUrl);
      return Post.findByIdAndDelete(postId);
    })
    .then((result) => {
      return User.findById(req.userId);
    })
    .then((user) => {
      user.posts.pull(postId);
      return user.save();
    })
    .then((result) => {
      res.status(200).json({ message: "Post deleted successfuly" });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};
