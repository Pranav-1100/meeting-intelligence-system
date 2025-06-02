'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';

export default function StatsCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  trendValue, 
  trendDirection,
  color = 'blue',
  onClick 
}) {
  const colorClasses = {
    blue: {
      bg: 'bg-blue-50',
      icon: 'text-blue-600',
      accent: 'text-blue-600'
    },
    green: {
      bg: 'bg-green-50',
      icon: 'text-green-600',
      accent: 'text-green-600'
    },
    yellow: {
      bg: 'bg-yellow-50',
      icon: 'text-yellow-600',
      accent: 'text-yellow-600'
    },
    purple: {
      bg: 'bg-purple-50',
      icon: 'text-purple-600',
      accent: 'text-purple-600'
    },
    red: {
      bg: 'bg-red-50',
      icon: 'text-red-600',
      accent: 'text-red-600'
    },
    gray: {
      bg: 'bg-gray-50',
      icon: 'text-gray-600',
      accent: 'text-gray-600'
    }
  };

  const colors = colorClasses[color] || colorClasses.blue;

  const getTrendIcon = () => {
    if (trendDirection === 'up') {
      return <TrendingUp className="h-3 w-3 text-green-500" />;
    } else if (trendDirection === 'down') {
      return <TrendingDown className="h-3 w-3 text-red-500" />;
    }
    return null;
  };

  const getTrendColor = () => {
    if (trendDirection === 'up') return 'text-green-600';
    if (trendDirection === 'down') return 'text-red-600';
    return 'text-gray-600';
  };

  return (
    <div 
      className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${
        onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 mb-1">
            {title}
          </p>
          <p className="text-2xl font-bold text-gray-900 mb-2">
            {value}
          </p>
          
          {/* Trend information */}
          {(trend || trendValue) && (
            <div className="flex items-center space-x-1">
              {getTrendIcon()}
              <span className={`text-xs ${getTrendColor()}`}>
                {trendValue && (
                  <span className="font-medium mr-1">
                    {trendDirection === 'up' ? '+' : trendDirection === 'down' ? '-' : ''}
                    {trendValue}
                  </span>
                )}
                <span className="text-gray-600">
                  {trend}
                </span>
              </span>
            </div>
          )}
        </div>
        
        {/* Icon */}
        <div className={`${colors.bg} p-3 rounded-lg`}>
          <Icon className={`h-6 w-6 ${colors.icon}`} />
        </div>
      </div>
    </div>
  );
}