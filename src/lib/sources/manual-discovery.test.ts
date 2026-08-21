import { describe, expect, it } from 'vitest'
import { classifyManualDiscovery } from './manual-discovery'

describe('manual platform discovery', () => {
  it('classifies matching public profile URLs without asserting availability', () => {
    const result = classifyManualDiscovery('Envryn', [
      { title: 'Envryn', url: 'https://www.instagram.com/envryn/', content: 'Public profile' },
      { title: 'Envryn Gaming', url: 'https://twitch.tv/envryngaming', content: 'Channel' },
      { title: 'Community', url: 'https://reddit.com/r/envryn', content: 'Subreddit' },
      { title: 'Unrelated', url: 'https://instagram.com/notion', content: 'Other profile' },
    ])

    expect(result.Instagram?.[0]?.label).toBe('@envryn')
    expect(result.Twitch?.[0]?.url).toBe('https://twitch.tv/envryngaming')
    expect(result['Reddit Community']?.[0]?.label).toBe('r/envryn')
    expect(result.Instagram).toHaveLength(1)
  })

  it('ignores login, search, post and malformed URLs', () => {
    const result = classifyManualDiscovery('Envryn', [
      { title: 'Post', url: 'https://instagram.com/p/envryn', content: '' },
      { title: 'Search', url: 'https://twitch.tv/search?term=envryn', content: '' },
      { title: 'User', url: 'https://reddit.com/u/envryn', content: '' },
      { title: 'Bad', url: 'not a URL', content: '' },
    ])

    expect(result).toEqual({})
  })
})
