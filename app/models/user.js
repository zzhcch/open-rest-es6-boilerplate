const U         = require('../lib/utils');
const ModelBase = require('./base');
const config    = require('../configs');

const Sequelize = U.rest.Sequelize;
const CHECK_PASS_ERROR = Error('Password or Email error.');
const USER_STATUS_ERROR = Error('User had disabled.');
const USER_DELETED_ERROR = Error('User had deleted.');
const AVATAR_ROOT = config.avatar.uri;
const AVATAR_PATH = config.avatar.path;

const CALC_PASS = (user) => {
  if ((user.changed().indexOf('password') > -1) || (user.isNewRecord))  {
    user.password = user.calcPass(user.password);
  }
};


module.exports = (sequelize) => {
  const User = U._.extend(sequelize.define('user', {
    id: {
      type: Sequelize.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: Sequelize.STRING(30),
      allowNull: false,
      set: function(val) {
        this.setDataValue('name', U.nt2space(val));
      },
      validate: {
        len: [2, 30]
      }
    },
    avatar: {
      type: Sequelize.STRING(255),
      allowNull: true,
      validate: {
        len: [1, 255]
      },
      get: function() {
        if (!this.getDataValue('avatar')) return null;
        return `${AVATAR_ROOT}/${this.getDataValue('avatar')}`;
      },
      set: function(val) {
        let image, value, origFile, filepath;
        image = U.decodeBase64Image(val);
        if (!image) return;
        value = User.avatarPath(`${this.id}_${U.randStr(10)}`, image.type);
        origFile = `${AVATAR_PATH}/${this.getDataValue('avatar')}`;
        U.fs.existsSync(origFile) && U.fs.unlinkSync(origFile);
        filepath = `${AVATAR_PATH}/${value}`;
        U.mkdirp(U.path.dirname(filepath));
        U.fs.writeFileSync(filepath, image.data);
        this.setDataValue('avatar', value);
      },
      comment: '用户头像'
    },
    email: {
      type: Sequelize.STRING(100),
      allowNull: false,
      validate: {
        isEmail: true
      },
      unique: true,
      comment: '用户email地址'
    },
    qq: {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: null,
      validate: {
        isNumber: true
      },
      comment: '用户qq号码'
    },
    wechat: {
      type: Sequelize.STRING(30),
      allowNull: true,
      defaultValue: null,
      validate: {
        isNumber: true
      },
      comment: '用户微信账号'
    },
    password: {
      type: Sequelize.STRING(32),
      allowNull: false
    },
    salt: {
      type: Sequelize.STRING(20),
      allowNull: false
    },
    role: {
      type: Sequelize.ENUM,
      values: ['admin', 'member'],
      defaultValue: 'member',
      allowNull: false
    },
    status: {
      type: Sequelize.ENUM,
      values: ['disabled', 'enabled'],
      defaultValue: 'enabled',
      allowNull: false,
      comment: '是否可用'
    },
    language: {
      type: Sequelize.STRING,
      defaultValue: 'zh',
      allowNull: false,
      comment: '当前用户的语言设置'
    },
    isDelete: {
      type: Sequelize.ENUM,
      values: ['yes', 'no'],
      defaultValue: 'no',
      allowNull: false,
      comment: '是否被删除'
    }
  }, {
    comment: '系统用户表',
    freezeTableName: true,
    hooks: {
      beforeValidate: (user) => {
        if (user.isNewRecord) user.salt = U.randStr(10);
      },
      beforeCreate: CALC_PASS,
      beforeUpdate: CALC_PASS
    },

    instanceMethods: {
      /** 这里之所以要单独定义 toJSON 是为了隐藏 salt 和 password 对外 */
      toJSON: function() {
        return U._.omit(this.get(), 'password', 'salt');
      },

      calcPass: function(password) {
        return U.md5(`${this.salt}${U.md5(password)}${this.salt}`);
      },

      checkPass: function(password) {
        return this.calcPass(password) === this.password;
      }
    },

    classMethods: {
      checkPass: (req, email, password, callback) => {
        let where = {email};
        User.findOne({where}).catch(callback).then((user) => {
          if (!user) return callback(CHECK_PASS_ERROR);
          if (!user.checkPass(password)) return callback(CHECK_PASS_ERROR);
          if (user.status === 'disabled') return callback(USER_STATUS_ERROR);
          if (user.isDelete === 'yes') return callback(USER_DELETED_ERROR);
          callback(null, user);
        });
      },

      /** 计算头像路径 */
      avatarPath: (id, type) => {
        let t = type.split('/');
        let md5str = U.md5(id);
        return [
          "users",
          md5str.substr(0, 2),
          md5str.substr(2, 3),
          `${id}.${t[1] || t}`
        ].join('/');
      }
    }

  }), ModelBase, {
    unique: ['email'],
    sort: {
      default: 'createdAt',
      allow: ['name', 'updatedAt', 'createdAt'],
    },
    writableCols: [
      'email', 'name', 'password',
      'role', 'status', 'avatar'
    ],
    editableCols: [
      'name', 'password',
      'role', 'status', 'avatar'
    ],
    /** 只有管理员才可以修改的字段 */
    onlyAdminCols: ['role', 'status'],

    /** 定义允许包含返回的字段，不设置为全部 */
    allowIncludeCols: [
      'name', 'role', 'status', 'isDelete',
      'createdAt', 'avatar', 'email',
      'language'
    ]
  });

  return User;
};
