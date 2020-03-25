using Microsoft.AspNetCore.Http;
using Umbraco.Core.Net;

namespace Umbraco.Web.BackOffice.AspNetCore
{
    public class AspNetCoreUserAgentProvider : IUserAgentProvider
    {
        private readonly IHttpContextAccessor _httpContextAccessor;

        public AspNetCoreUserAgentProvider(IHttpContextAccessor httpContextAccessor)
        {
            _httpContextAccessor = httpContextAccessor;
        }

        public string GetUserAgent()
        {
            return _httpContextAccessor.HttpContext.Request.Headers["User-Agent"].ToString();
        }
    }
}
