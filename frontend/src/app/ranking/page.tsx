'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import LeaderboardRow from '@/components/gamification/LeaderboardRow'
import BadgeCard from '@/components/gamification/BadgeCard'
import LevelProgress from '@/components/gamification/LevelProgress'
import type { UserPointsSummary, Badge, UserBadge } from '@/types'
import { Trophy, Award, Loader2, Crown } from 'lucide-react'

export default function RankingPage() {
  const { user } = useAuth()
  const [leaderboard, setLeaderboard] = useState<UserPointsSummary[]>([])
  const [myPoints, setMyPoints] = useState<UserPointsSummary | null>(null)
  const [badges, setBadges] = useState<Badge[]>([])
  const [myBadges, setMyBadges] = useState<UserBadge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getLeaderboard(20),
      api.getMyPoints(),
      api.getBadges(),
      api.getMyBadges(),
    ]).then(([lb, pts, b, mb]) => {
      setLeaderboard(lb)
      setMyPoints(pts)
      setBadges(b)
      setMyBadges(mb)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const earnedBadgeIds = new Set(myBadges.map(ub => ub.badge.id))

  if (loading) {
    return <AppShell><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-brand-600 animate-spin" /></div></AppShell>
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 mb-8">
        <Trophy className="w-6 h-6 text-gold-500" />
        Ranking &amp; Conquistas
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leaderboard */}
        <div className="lg:col-span-2 space-y-6">
          {/* My Level */}
          {myPoints && (
            <LevelProgress points={myPoints.total_points} />
          )}

          {/* Leaderboard */}
          <div className="card p-5">
            <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
              <Crown className="w-5 h-5 text-gold-500" />
              Leaderboard Geral
            </h2>

            {leaderboard.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Nenhum participante ainda.</p>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((entry, i) => (
                  <LeaderboardRow
                    key={entry.user_id}
                    position={i + 1}
                    name={entry.full_name || 'Usuário'}
                    points={entry.total_points}
                    isCurrentUser={entry.user_id === user?.id}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Badges */}
        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
              <Award className="w-5 h-5 text-violet-500" />
              Conquistas
              <span className="ml-auto badge-pill bg-violet-50 text-violet-600">
                {myBadges.length}/{badges.length}
              </span>
            </h2>

            {badges.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Badges em construção.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {badges.map((badge) => {
                  const earned = earnedBadgeIds.has(badge.id)
                  const userBadge = myBadges.find(ub => ub.badge.id === badge.id)
                  return (
                    <BadgeCard
                      key={badge.id}
                      name={badge.name}
                      description={badge.description}
                      icon={badge.icon}
                      earned={earned}
                      earnedAt={userBadge?.earned_at}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
