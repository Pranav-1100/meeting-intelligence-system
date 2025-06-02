const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  return {
    entry: {
      // Background script
      background: './src/background/index.js',
      
      // Content script
      content: './src/content/index.js',
      
      // Popup
      popup: './src/popup/index.js',
      
      // Overlay (injected into meeting pages)
      overlay: './src/overlay/index.js'
    },

    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true
    },

    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env', '@babel/preset-react']
            }
          }
        },
        {
          test: /\.css$/,
          use: [
            isProduction ? MiniCssExtractPlugin.loader : 'style-loader',
            'css-loader'
          ]
        },
        {
          test: /\.(png|jpg|jpeg|gif|svg)$/,
          type: 'asset/resource',
          generator: {
            filename: 'images/[name][ext]'
          }
        }
      ]
    },

    plugins: [
      // Copy static files
      new CopyWebpackPlugin({
        patterns: [
          {
            from: 'public',
            to: '.',
            globOptions: {
              ignore: ['**/*.html'] // HTML files are handled by HtmlWebpackPlugin
            }
          }
        ]
      }),

      // Generate popup HTML
      new HtmlWebpackPlugin({
        template: './public/popup.html',
        filename: 'popup.html',
        chunks: ['popup'],
        inject: 'body'
      }),

      // Generate overlay HTML  
      new HtmlWebpackPlugin({
        template: './src/overlay/overlay.html',
        filename: 'overlay.html',
        chunks: ['overlay'],
        inject: 'body'
      }),

      // Extract CSS in production
      ...(isProduction ? [
        new MiniCssExtractPlugin({
          filename: '[name].css'
        })
      ] : [])
    ],

    resolve: {
      extensions: ['.js', '.jsx'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@shared': path.resolve(__dirname, '../shared')
      }
    },

    // Development server configuration
    devtool: isProduction ? false : 'cheap-module-source-map',

    // Optimization
    optimization: {
      minimize: isProduction,
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendor',
            chunks: 'all',
            enforce: true
          }
        }
      }
    },

    // Watch options for development
    watchOptions: {
      ignored: /node_modules/,
      poll: 1000
    },

    // Performance hints
    performance: {
      hints: isProduction ? 'warning' : false,
      maxEntrypointSize: 512000,
      maxAssetSize: 512000
    },

    // Target web for extension environment
    target: 'web',

    // Extension-specific configurations
    resolve: {
      fallback: {
        // Chrome extensions don't have Node.js modules
        "fs": false,
        "path": false,
        "os": false,
        "crypto": false,
        "stream": false,
        "http": false,
        "https": false,
        "zlib": false,
        "url": false
      }
    }
  };
};